using Microsoft.EntityFrameworkCore;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<LifetimeSnapshot> LifetimeSnapshots => Set<LifetimeSnapshot>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<RateHistory> RateHistory => Set<RateHistory>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
