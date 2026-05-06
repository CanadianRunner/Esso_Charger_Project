namespace PumpCharger.Api.Config;

public class DatabaseOptions
{
    public const string SectionName = "Database";
    public string Path { get; set; } = "data/pumpcharger.db";
}

public class LoggingPathOptions
{
    public const string SectionName = "Logging";
    public string Path { get; set; } = "logs/";
}

public class PumpOptions
{
    public const string SectionName = "Pump";
    public string DefaultTimezone { get; set; } = "America/Los_Angeles";
    public int DefaultRateCentsPerKwh { get; set; } = 13;
}
