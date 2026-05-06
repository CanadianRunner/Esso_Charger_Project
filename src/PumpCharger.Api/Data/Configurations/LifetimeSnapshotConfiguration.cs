using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Data.Configurations;

public class LifetimeSnapshotConfiguration : IEntityTypeConfiguration<LifetimeSnapshot>
{
    public void Configure(EntityTypeBuilder<LifetimeSnapshot> builder)
    {
        builder.ToTable("LifetimeSnapshots");
        builder.HasKey(s => s.Id);

        builder.Property(s => s.Id).ValueGeneratedOnAdd();
        builder.Property(s => s.RecordedAt).IsRequired();
        builder.Property(s => s.HpwcLifetimeWh).IsRequired();
        builder.Property(s => s.ComputedLifetimeWh).IsRequired();
        builder.Property(s => s.DriftWh).IsRequired();

        builder.HasIndex(s => s.RecordedAt);
    }
}
