namespace PumpCharger.Api.Data;

public static class PathResolver
{
    public static string Resolve(string contentRoot, string configuredPath) =>
        Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.GetFullPath(Path.Combine(contentRoot, configuredPath));
}
