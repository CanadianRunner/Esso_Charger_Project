using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace PumpCharger.Tests.Auth;

/// <summary>
/// Integration tests over the AuthController using WebApplicationFactory. Each
/// test gets a fresh API instance with an isolated in-memory SQLite database.
/// </summary>
public class AuthEndpointsTests : IClassFixture<TestApiFactory>
{
    private readonly TestApiFactory _factory;

    public AuthEndpointsTests(TestApiFactory factory)
    {
        _factory = factory;
    }

    private HttpClient NewClient() => _factory.CreateClient(new()
    {
        AllowAutoRedirect = false,
    });

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private record StatusResponse(bool authed, bool hasPassword);

    [Fact]
    public async Task Status_with_no_password_reports_setup_needed()
    {
        // Fresh factory per test class — but state from prior tests within a class persists
        // because IClassFixture is one instance. We use a unique factory per fact via
        // creating one inline. For status-on-fresh-state, instantiate a one-off factory.
        await using var oneOff = new TestApiFactory();
        var client = oneOff.CreateClient();

        var resp = await client.GetAsync("/api/auth/status");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<StatusResponse>(JsonOpts);
        Assert.NotNull(body);
        Assert.False(body!.authed);
        Assert.False(body.hasPassword);
    }

    [Fact]
    public async Task Setup_then_login_succeeds_and_sets_cookie()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();

        var setup = await client.PostAsJsonAsync("/api/auth/setup", new { Password = "first-time-password" });
        Assert.Equal(HttpStatusCode.OK, setup.StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login",
            new { Password = "first-time-password", RememberDevice = false });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        // Cookie should be present in Set-Cookie header.
        Assert.True(login.Headers.TryGetValues("Set-Cookie", out var cookies));
        Assert.Contains(cookies!, c => c.Contains("PumpChargerAuth"));
    }

    [Fact]
    public async Task Setup_a_second_time_returns_conflict()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();

        var first = await client.PostAsJsonAsync("/api/auth/setup", new { Password = "abc" });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/auth/setup", new { Password = "xyz" });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    [Fact]
    public async Task Login_with_no_password_set_returns_403()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/auth/login",
            new { Password = "anything", RememberDevice = false });
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    [Fact]
    public async Task Login_with_wrong_password_returns_401()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/auth/setup", new { Password = "right" });

        var resp = await client.PostAsJsonAsync("/api/auth/login",
            new { Password = "wrong", RememberDevice = false });
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Five_wrong_passwords_trigger_lockout_with_429()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/auth/setup", new { Password = "right" });

        // 5 failed attempts.
        for (var i = 0; i < 5; i++)
        {
            var fail = await client.PostAsJsonAsync("/api/auth/login",
                new { Password = "wrong", RememberDevice = false });
            Assert.Equal(HttpStatusCode.Unauthorized, fail.StatusCode);
        }

        // 6th attempt — even with the correct password — should be locked out.
        var locked = await client.PostAsJsonAsync("/api/auth/login",
            new { Password = "right", RememberDevice = false });
        Assert.Equal(HttpStatusCode.TooManyRequests, locked.StatusCode);
    }

    [Fact]
    public async Task Logout_without_session_returns_401()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();

        var resp = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Authenticated_request_status_reports_authed_true()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();

        await client.PostAsJsonAsync("/api/auth/setup", new { Password = "pw" });
        await client.PostAsJsonAsync("/api/auth/login", new { Password = "pw", RememberDevice = false });

        // HttpClient automatically replays the auth cookie on subsequent requests
        // within the same client instance.
        var status = await client.GetAsync("/api/auth/status");
        var body = await status.Content.ReadFromJsonAsync<StatusResponse>(JsonOpts);
        Assert.NotNull(body);
        Assert.True(body!.authed);
        Assert.True(body.hasPassword);
    }
}
