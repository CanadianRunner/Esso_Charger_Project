using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Auth;
using PumpCharger.Api.Config;
using PumpCharger.Api.Data;
using PumpCharger.Api.Extensions;
using PumpCharger.Api.Hubs;
using PumpCharger.Api.Services.Auth;
using PumpCharger.Api.Services.Display;
using PumpCharger.Api.Services.Polling;
using PumpCharger.Api.Services.Rate;
using PumpCharger.Api.Services.Sessions;
using PumpCharger.Api.Services.Settings;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables();

builder.Services.Configure<DatabaseOptions>(builder.Configuration.GetSection(DatabaseOptions.SectionName));
builder.Services.Configure<PumpOptions>(builder.Configuration.GetSection(PumpOptions.SectionName));

var contentRoot = builder.Environment.ContentRootPath;

var loggingPath = PathResolver.Resolve(
    contentRoot,
    builder.Configuration["Logging:Path"] ?? "var/logs/");
Directory.CreateDirectory(loggingPath);

builder.Host.UseSerilog((context, services, configuration) =>
{
    configuration
        .MinimumLevel.Information()
        .MinimumLevel.Override("Microsoft.AspNetCore", Serilog.Events.LogEventLevel.Warning)
        .MinimumLevel.Override("Microsoft.EntityFrameworkCore", Serilog.Events.LogEventLevel.Warning)
        .Enrich.FromLogContext()
        .WriteTo.Console()
        .WriteTo.File(
            Path.Combine(loggingPath, "pumpcharger-.log"),
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 14);
});

var dbPath = PathResolver.Resolve(
    contentRoot,
    builder.Configuration["Database:Path"] ?? "var/pumpcharger.db");
var dbDir = Path.GetDirectoryName(dbPath);
if (!string.IsNullOrEmpty(dbDir))
{
    Directory.CreateDirectory(dbDir);
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

builder.Services.AddExternalClients(builder.Configuration);

builder.Services.AddScoped<ISettingsService, SettingsService>();
builder.Services.AddScoped<ICurrentRateProvider, SettingsRateProvider>();

builder.Services.AddSingleton<VitalsBus>();
builder.Services.AddSingleton<SessionDetector>();
builder.Services.AddSingleton<SessionStore>();
builder.Services.AddScoped<PumpStateBuilder>();
builder.Services.AddHostedService<HpwcPollerService>();
builder.Services.AddHostedService<SessionManagerService>();
builder.Services.AddHostedService<DisplayBroadcastService>();

builder.Services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
builder.Services.AddSingleton<LoginAttemptTracker>(sp =>
    new LoginAttemptTracker(sp.GetRequiredService<Func<DateTime>>()));

builder.Services
    .AddAuthentication(AuthSchemes.Cookie)
    .AddCookie(AuthSchemes.Cookie, options =>
    {
        options.Cookie.Name = AuthSchemes.Cookie;
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromDays(30);
        options.SlidingExpiration = false;
        // Default cookie auth redirects to /Account/Login on 401 and /Account/AccessDenied
        // on 403, which is wrong for a JSON API — return status codes instead.
        options.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });

builder.Services
    .AddAuthorization(options =>
    {
        options.AddPolicy(AuthPolicies.AdminOnly, p =>
            p.RequireAuthenticatedUser().RequireRole(AuthClaims.AdminRole));
    });

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
    await settings.SeedDefaultsAsync();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSerilogRequestLogging();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<PumpHub>("/hubs/pump");

app.Run();

public partial class Program { }
