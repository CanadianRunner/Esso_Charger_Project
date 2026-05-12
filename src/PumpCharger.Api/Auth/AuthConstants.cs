namespace PumpCharger.Api.Auth;

public static class AuthSchemes
{
    public const string Cookie = "PumpChargerAuth";
}

public static class AuthPolicies
{
    public const string AdminOnly = "AdminOnly";
}

public static class AuthClaims
{
    public const string AdminRole = "admin";
}
