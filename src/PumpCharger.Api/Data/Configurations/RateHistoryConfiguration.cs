using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Data.Configurations;

public class RateHistoryConfiguration : IEntityTypeConfiguration<RateHistory>
{
    public void Configure(EntityTypeBuilder<RateHistory> builder)
    {
        builder.ToTable("RateHistory");
        builder.HasKey(r => r.Id);

        builder.Property(r => r.Id).ValueGeneratedOnAdd();
        builder.Property(r => r.EffectiveFrom).IsRequired();
        builder.Property(r => r.EffectiveUntil);
        builder.Property(r => r.CentsPerKwh).IsRequired();
        builder.Property(r => r.Source).IsRequired().HasConversion<int>();
        builder.Property(r => r.OpenEiScheduleId).HasMaxLength(128);
        builder.Property(r => r.Notes).HasMaxLength(2000);

        builder.HasIndex(r => r.EffectiveFrom);
    }
}
