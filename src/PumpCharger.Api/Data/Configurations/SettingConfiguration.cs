using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Data.Configurations;

public class SettingConfiguration : IEntityTypeConfiguration<Setting>
{
    public void Configure(EntityTypeBuilder<Setting> builder)
    {
        builder.ToTable("Settings");
        builder.HasKey(s => s.Key);

        builder.Property(s => s.Key).HasMaxLength(128).IsRequired();
        builder.Property(s => s.Value).IsRequired();
        builder.Property(s => s.UpdatedAt).IsRequired();
    }
}
