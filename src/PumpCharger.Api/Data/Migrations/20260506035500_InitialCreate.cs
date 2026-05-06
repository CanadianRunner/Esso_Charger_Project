using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PumpCharger.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Timestamp = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Actor = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Action = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Details = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LifetimeSnapshots",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RecordedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    HpwcLifetimeWh = table.Column<long>(type: "INTEGER", nullable: false),
                    ComputedLifetimeWh = table.Column<long>(type: "INTEGER", nullable: false),
                    DriftWh = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LifetimeSnapshots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RateHistory",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    EffectiveFrom = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EffectiveUntil = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CentsPerKwh = table.Column<int>(type: "INTEGER", nullable: false),
                    Source = table.Column<int>(type: "INTEGER", nullable: false),
                    OpenEiScheduleId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RateHistory", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    EnergyWh = table.Column<long>(type: "INTEGER", nullable: false),
                    RateAtStartCentsPerKwh = table.Column<int>(type: "INTEGER", nullable: false),
                    CostCents = table.Column<long>(type: "INTEGER", nullable: false),
                    PeakKw = table.Column<decimal>(type: "TEXT", precision: 10, scale: 2, nullable: false),
                    DurationSeconds = table.Column<long>(type: "INTEGER", nullable: false),
                    IsMerged = table.Column<bool>(type: "INTEGER", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    PowerSamplesJson = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Settings",
                columns: table => new
                {
                    Key = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Value = table.Column<string>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Key);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_Action",
                table: "AuditLogs",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_Timestamp",
                table: "AuditLogs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_LifetimeSnapshots_RecordedAt",
                table: "LifetimeSnapshots",
                column: "RecordedAt");

            migrationBuilder.CreateIndex(
                name: "IX_RateHistory_EffectiveFrom",
                table: "RateHistory",
                column: "EffectiveFrom");

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_EndedAt",
                table: "Sessions",
                column: "EndedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_StartedAt",
                table: "Sessions",
                column: "StartedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "LifetimeSnapshots");

            migrationBuilder.DropTable(
                name: "RateHistory");

            migrationBuilder.DropTable(
                name: "Sessions");

            migrationBuilder.DropTable(
                name: "Settings");
        }
    }
}
