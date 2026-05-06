using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Data.Configurations;

public class SessionConfiguration : IEntityTypeConfiguration<Session>
{
    public void Configure(EntityTypeBuilder<Session> builder)
    {
        builder.ToTable("Sessions");
        builder.HasKey(s => s.Id);

        builder.Property(s => s.StartedAt).IsRequired();
        builder.Property(s => s.EndedAt);
        builder.Property(s => s.EnergyWh).IsRequired();
        builder.Property(s => s.RateAtStartCentsPerKwh).IsRequired();
        builder.Property(s => s.CostCents).IsRequired();
        builder.Property(s => s.PeakKw).HasPrecision(10, 2).IsRequired();
        builder.Property(s => s.DurationSeconds).IsRequired();
        builder.Property(s => s.IsMerged).IsRequired();
        builder.Property(s => s.Notes).HasMaxLength(2000);
        builder.Property(s => s.PowerSamplesJson);

        builder.HasIndex(s => s.StartedAt);
        builder.HasIndex(s => s.EndedAt);
    }
}
