using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Data.Configurations;

public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("AuditLogs");
        builder.HasKey(a => a.Id);

        builder.Property(a => a.Id).ValueGeneratedOnAdd();
        builder.Property(a => a.Timestamp).IsRequired();
        builder.Property(a => a.Actor).HasMaxLength(64).IsRequired();
        builder.Property(a => a.Action).HasMaxLength(128).IsRequired();
        builder.Property(a => a.Details).IsRequired();

        builder.HasIndex(a => a.Timestamp);
        builder.HasIndex(a => a.Action);
    }
}
