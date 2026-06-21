/*
  Warnings:

  - A unique constraint covering the columns `[custom_domain]` on the table `Project` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "Deployment_project_id_idx" ON "Deployment"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_custom_domain_key" ON "Project"("custom_domain");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");
