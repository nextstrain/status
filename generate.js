#!/usr/bin/env node
import { groups, sort } from "d3-array";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import html from "./html.js";

// Read data files
const baseDir = path.dirname(process.argv[1]);
const workflowRuns = JSON.parse(fs.readFileSync(path.join(baseDir, "workflow-runs.json"), "utf-8"));

const runsByRepoAndWorkflow =
  groups(
    sort(
      workflowRuns,
      d => d.repository_full_name,
      d => d.workflow_name,
      d => -d.created_at,
      d => -d.id),
    d => d.repository_full_name,
    d => d.workflow_name );

// Generate HTML
process.stdout.write(String(html`
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Pathogen build status</title>
      <link rel="stylesheet" href="workflow-runs.css">
    </head>

    <body>
      <h1>Pathogen build status</h1>
      <nav>
        <a href="?">compact</a>
        / <a href="?time-relative">time-relative</a>
      </nav>
      <p>
        For repos using our shared <a href="https://github.com/nextstrain/.github/blob/HEAD/.github/workflows/pathogen-repo-build.yaml"><code>pathogen-repo-build.yaml</code> workflow</a>.
      </p>
      ${
        runsByRepoAndWorkflow.map(([repository_full_name, workflows]) => html`
          <h2 id="">
            ${repository_full_name.replace(/^nextstrain\//, "")}
            <a href="#${repository_full_name.replace(/^nextstrain\//, "")}">#</a>
          </h2>
          ${
            workflows.map(([workflow_name, runs]) => html`
              <h3>
                ${workflow_name}
                <span>(<a href="${runs[0].workflow_html_url}"><code>${runs[0].workflow_path}</code></a>)</span>
              </h3>
              <ol>
              ${
                runs.map(run => html`
                  <li class="${(run.conclusion ?? run.status).replace(/_/g, "-")}" data-run="${JSON.stringify(run)}">
                    <details>
                      <summary>${indicator(run)}</summary>
                      <div>
                        <time datetime="${run.created_at}">${run.created_at}</time>
                        <a href="${run.html_url}">run details</a>
                        <code>${run.event}</code>
                        <code>${run.commit_id.slice(0, 8)}</code>
                      </div>
                    </details>
                  </li>
                `)
              }
              </ol>
            `)
          }
        `)
      }
    </body>
    <script src="luxon.min.js"></script>
    <script src="workflow-runs.js"></script>
  </html>
`));

function indicator(run) {
  switch (run.conclusion ?? run.status) {
    case "success":     return "✔";
    case "failure":     return "✘";
    case "in_progress": return "⋯";
    case "cancelled":   return "🛇";
    default:            return run.conclusion;
  }
}
