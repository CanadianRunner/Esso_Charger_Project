using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PumpCharger.Api.Data;

namespace PumpCharger.Tests.Auth;

/// <summary>
/// WebApplicationFactory that swaps the production SQLite file for a single
/// in-memory database shared across the factory's lifetime. Forces all external
/// integrations into Fake mode so background services don't churn during tests.
/// </summary>
public class TestApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection;

    public TestApiFactory()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Reuse the Development environment (Fake clients, relative-path DB/logs).
        // The DbContext registration is swapped below so the file-path setting
        // never actually gets touched.
        builder.UseEnvironment("Development");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.AddDbContext<AppDbContext>(o => o.UseSqlite(_connection));
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _connection.Dispose();
        }
        base.Dispose(disposing);
    }
}
