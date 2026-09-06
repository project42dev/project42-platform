const actionReferencePattern =
  /^\s*(?:-\s+)?uses:\s*["']?([^@\s"']+)@([^\s#"']+)/gm;
const jobHeaderPattern = /^  ([A-Za-z][A-Za-z0-9_-]*):\s*$/gm;
const writePermissionPattern =
  /^\s{4,}([A-Za-z][A-Za-z0-9_-]*):\s*write\s*$/gm;
const publishingPattern =
  /uses:\s*actions\/(?:configure-pages|upload-pages-artifact|deploy-pages)@|(?:^|\s)(?:npm\s+publish|docker\s+push|gh\s+release\s+create|wrangler\s+deploy|az\s+(?:webapp|functionapp)\s+deploy)(?:\s|$)/m;
const deploymentPattern =
  /uses:\s*actions\/deploy-pages@|^\s{4}environment:\s*$/m;
const positivePushGuardPattern =
  /github\.event_name\s*==\s*['"]push['"]/;
const mainOrTagGuardPattern =
  /github\.ref\s*==\s*['"]refs\/heads\/main['"]|startsWith\(\s*github\.ref\s*,\s*['"]refs\/tags\//;

function getJobs(workflow) {
  const jobsMarker = workflow.search(/^jobs:\s*$/m);
  if (jobsMarker < 0) {
    return [];
  }

  const jobsText = workflow.slice(jobsMarker);
  const headers = [...jobsText.matchAll(jobHeaderPattern)];
  return headers.map((header, index) => ({
    id: header[1],
    text: jobsText.slice(
      header.index,
      headers[index + 1]?.index ?? jobsText.length,
    ),
  }));
}

function getStepBlocks(workflow) {
  const stepStartPattern = /^\s{6}-\s+(?:name:|uses:|run:)/gm;
  const starts = [...workflow.matchAll(stepStartPattern)];
  return starts.map((start, index) =>
    workflow.slice(start.index, starts[index + 1]?.index ?? workflow.length),
  );
}

function getWorkflowPermissions(workflow) {
  const jobsMarker = workflow.search(/^jobs:\s*$/m);
  const beforeJobs = jobsMarker < 0 ? workflow : workflow.slice(0, jobsMarker);
  const lines = beforeJobs.split(/\r?\n/);
  const start = lines.findIndex((line) => /^permissions:/.test(line));
  if (start < 0) {
    return "";
  }

  const permissionLines = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (line !== "" && !/^[ \t]/.test(line)) {
      break;
    }
    permissionLines.push(line);
  }
  return permissionLines.join("\n");
}

function isDeploymentJob(job) {
  return (
    deploymentPattern.test(job.text) ||
    /^\s{6}name:\s*github-pages\s*$/m.test(job.text)
  );
}

function isPublishingJob(job) {
  return publishingPattern.test(job.text) || isDeploymentJob(job);
}

function hasPositivePublishGuard(text) {
  const jobIf = text.match(/^\s{4}if:\s*(.+)$/m)?.[1] ?? "";
  return (
    positivePushGuardPattern.test(jobIf) &&
    mainOrTagGuardPattern.test(jobIf)
  );
}

export function validateWorkflowGovernance({
  name,
  workflow,
  deploymentWorkflow = false,
}) {
  const errors = [];

  for (const reference of workflow.matchAll(actionReferencePattern)) {
    if (!/^[0-9a-f]{40}$/i.test(reference[2])) {
      errors.push(
        `${name}: action '${reference[1]}' must use an immutable 40-character SHA.`,
      );
    }
  }

  for (const step of getStepBlocks(workflow)) {
    if (
      /uses:\s*actions\/checkout@/i.test(step) &&
      !/persist-credentials:\s*false/i.test(step)
    ) {
      errors.push(
        `${name}: every checkout step must set persist-credentials to false.`,
      );
    }
  }

  if (!deploymentWorkflow) {
    return errors;
  }

  const hasManualDispatch = /^  workflow_dispatch:\s*$/m.test(workflow);
  const jobs = getJobs(workflow);
  const deploymentJobs = jobs.filter(isDeploymentJob);
  const validationJobs = jobs.filter((job) => !isPublishingJob(job));

  if (!hasManualDispatch) {
    errors.push(`${name}: deployment workflow must support manual validation.`);
  }
  if (deploymentJobs.length === 0) {
    errors.push(`${name}: deployment workflow has no deployment job.`);
  }
  if (
    validationJobs.length === 0 ||
    !validationJobs.some((job) => /validat|verif/i.test(job.id + job.text))
  ) {
    errors.push(
      `${name}: workflow_dispatch requires a separate read-only validation job.`,
    );
  }

  const workflowPermissions = getWorkflowPermissions(workflow);
  if (
    /\bwrite-all\b|^\s*[A-Za-z][A-Za-z0-9_-]*:\s*write\s*$/m.test(
      workflowPermissions,
    )
  ) {
    errors.push(
      `${name}: workflow-wide write or OIDC permissions are prohibited.`,
    );
  }

  for (const job of jobs) {
    const writes = [...job.text.matchAll(writePermissionPattern)].map(
      (match) => match[1],
    );
    if (
      /validat|verif/i.test(job.id) &&
      publishingPattern.test(job.text)
    ) {
      errors.push(
        `${name}: read-only job '${job.id}' contains a publish or deploy command.`,
      );
    }
    if (isPublishingJob(job)) {
      if (!hasPositivePublishGuard(job.text)) {
        errors.push(
          `${name}: publishing job '${job.id}' needs a positive push and main/tag guard.`,
        );
      }
      const requiredWrites = isDeploymentJob(job)
        ? ["pages", "id-token"]
        : ["pages"];
      for (const required of requiredWrites) {
        if (!writes.includes(required)) {
          errors.push(
            `${name}: publishing job '${job.id}' lacks '${required}: write'.`,
          );
        }
      }
      const allowedWrites = isDeploymentJob(job)
        ? ["pages", "id-token"]
        : ["pages"];
      const unexpectedWrites = writes.filter(
        (permission) => !allowedWrites.includes(permission),
      );
      if (unexpectedWrites.length > 0) {
        errors.push(
          `${name}: publishing job '${job.id}' has excessive write permissions: ${unexpectedWrites.join(", ")}.`,
        );
      }
    } else {
      if (writes.length > 0) {
        errors.push(
          `${name}: read-only job '${job.id}' has write permissions.`,
        );
      }
      if (publishingPattern.test(job.text)) {
        errors.push(
          `${name}: read-only job '${job.id}' contains a publish or deploy command.`,
        );
      }
    }
  }

  return errors;
}

export function assertWorkflowGovernance(workflows) {
  const errors = workflows.flatMap(validateWorkflowGovernance);
  if (errors.length > 0) {
    throw new Error(`Workflow governance failed:\n- ${errors.join("\n- ")}`);
  }
}
