CREATE TYPE "ListingGoldFixtureStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'DEPRECATED', 'REJECTED');
CREATE TYPE "ListingCalibrationReportStatus" AS ENUM ('EXCELLENT_MATCH', 'GOOD_MATCH', 'NEEDS_CALIBRATION', 'POOR_MATCH', 'INVALID_COMPARISON', 'BLOCKED');
CREATE TYPE "CraftRuleProposalStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED', 'APPLIED_EXTERNALLY');

CREATE TABLE "listing_gold_fixtures" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID,
  "source_draft_id" VARCHAR(255) NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "fixture_version" VARCHAR(50) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ListingGoldFixtureStatus" NOT NULL DEFAULT 'DRAFT',
  "name" VARCHAR(200) NOT NULL,
  "category" VARCHAR(120) NOT NULL,
  "product_truth_fingerprint" CHAR(16) NOT NULL,
  "craft_pack_id" VARCHAR(64) NOT NULL,
  "craft_pack_version" VARCHAR(50) NOT NULL,
  "fingerprint" CHAR(16) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "listing_gold_fixtures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_calibration_reports" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "fixture_id" UUID NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "report_version" VARCHAR(50) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ListingCalibrationReportStatus" NOT NULL,
  "overall_score" INTEGER NOT NULL,
  "craft_pack_id" VARCHAR(64) NOT NULL,
  "craft_pack_version" VARCHAR(50) NOT NULL,
  "fingerprint" CHAR(16) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "listing_calibration_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "craft_rule_proposals" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "proposal_version" VARCHAR(50) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "CraftRuleProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "craft_pack_id" VARCHAR(64) NOT NULL,
  "current_craft_pack_version" VARCHAR(50) NOT NULL,
  "target_rule_id" VARCHAR(200) NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "fingerprint" CHAR(16) NOT NULL,
  "payload" JSONB NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "approved_by_user_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "craft_rule_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "listing_gold_fixtures_id_workspace_id_key" ON "listing_gold_fixtures"("id", "workspace_id");
CREATE INDEX "listing_gold_fixtures_workspace_id_status_updated_at_idx" ON "listing_gold_fixtures"("workspace_id", "status", "updated_at");
CREATE INDEX "listing_gold_fixtures_workspace_id_category_status_idx" ON "listing_gold_fixtures"("workspace_id", "category", "status");
CREATE INDEX "listing_gold_fixtures_project_id_workspace_id_idx" ON "listing_gold_fixtures"("project_id", "workspace_id");
CREATE INDEX "listing_gold_fixtures_craft_pack_id_craft_pack_version_idx" ON "listing_gold_fixtures"("craft_pack_id", "craft_pack_version");
CREATE UNIQUE INDEX "listing_calibration_reports_id_workspace_id_key" ON "listing_calibration_reports"("id", "workspace_id");
CREATE INDEX "listing_calibration_reports_workspace_id_status_created_at_idx" ON "listing_calibration_reports"("workspace_id", "status", "created_at");
CREATE INDEX "listing_calibration_reports_fixture_id_workspace_id_created_at_idx" ON "listing_calibration_reports"("fixture_id", "workspace_id", "created_at");
CREATE INDEX "listing_calibration_reports_project_id_workspace_id_idx" ON "listing_calibration_reports"("project_id", "workspace_id");
CREATE UNIQUE INDEX "craft_rule_proposals_id_workspace_id_key" ON "craft_rule_proposals"("id", "workspace_id");
CREATE UNIQUE INDEX "craft_rule_proposals_workspace_id_fingerprint_key" ON "craft_rule_proposals"("workspace_id", "fingerprint");
CREATE INDEX "craft_rule_proposals_workspace_id_status_updated_at_idx" ON "craft_rule_proposals"("workspace_id", "status", "updated_at");
CREATE INDEX "craft_rule_proposals_workspace_id_target_rule_id_idx" ON "craft_rule_proposals"("workspace_id", "target_rule_id");
CREATE INDEX "craft_rule_proposals_craft_pack_id_current_craft_pack_version_idx" ON "craft_rule_proposals"("craft_pack_id", "current_craft_pack_version");

ALTER TABLE "listing_gold_fixtures" ADD CONSTRAINT "listing_gold_fixtures_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_gold_fixtures" ADD CONSTRAINT "listing_gold_fixtures_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_calibration_reports" ADD CONSTRAINT "listing_calibration_reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_calibration_reports" ADD CONSTRAINT "listing_calibration_reports_project_id_workspace_id_fkey" FOREIGN KEY ("project_id", "workspace_id") REFERENCES "projects"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_calibration_reports" ADD CONSTRAINT "listing_calibration_reports_fixture_id_workspace_id_fkey" FOREIGN KEY ("fixture_id", "workspace_id") REFERENCES "listing_gold_fixtures"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "craft_rule_proposals" ADD CONSTRAINT "craft_rule_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
