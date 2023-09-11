/* Query for data used to generate the pathogen workflow status page.
 */

/* XXX TODO: This conflates the overall workflow status/conclusion with the
 * status/conclusion of the specific workflow _job(s)_ which actually use our
 * shared pathogen-repo-build.yaml workflow.  The specific jobs could succeed
 * but other jobs in the overall workflow could fail, and we'd probably
 * indicate the "wrong" status/conclusion.  In practice, I'm not sure this
 * matters, but it could, so good to be aware that we might want to address
 * that nuance here in the future.  Hindering that at the moment is that
 * Steampipe doesn't expose individual jobs, so we'd have to do some additional
 * legwork to get their status.
 *   -trs, 8 Sept 2023
 */

with

repository as materialized (
    select
        r->>'full_name'         as repository_full_name,
        r->>'default_branch'    as default_branch
    from
        net_http_request,
        jsonb_array_elements(response_body::jsonb) as r
    where
        url = 'https://api.github.com/orgs/nextstrain/repos?per_page=100&sort=full_name'
),

workflow_id as materialized (
    select
        repository_full_name,
        id
    from
        github_workflow
    where
        repository_full_name in (
            select repository_full_name from repository
            except values
                /* These repos contain workflows which trigger a family of bugs related
                 * to workflow parsing.¹  Since none of those workflows are expected to
                 * be pathogen builds, just skip the repos entirely.
                 *   -trs, 8 Sept 2023
                 *
                 * ¹ <https://github.com/turbot/steampipe-plugin-github/issues/329>
                 */
                ('nextstrain/.github'),         -- "continue-on-error" with interpolated value
                ('nextstrain/nextclade'),       -- "repository_dispatch" with "types" of a string instead of string[]
                ('nextstrain/nextclade_data')   -- "repository_dispatch" with "types" of a string instead of string[]
        )

    except

    values
        /* These workflows trigger bugs related to workflow parsing.¹  Skip
         * them individually since we don't want to skip other workflows in the
         * same repos.
         *   -trs, 8 Sept 2023
         *
         * ¹ <https://github.com/turbot/steampipe-plugin-github/issues/329>
         */
        ('nextstrain/ncov-ingest', 5200250) -- "Update image"
),

workflow as materialized (
    select
        repository_full_name,
        id::text    as workflow_id,
        path        as workflow_path,
        name        as workflow_name,
        html_url    as workflow_html_url

    from
        workflow_id
            join github_workflow using (repository_full_name, id)

    where
            workflow_file_content_json @@ '$.jobs.*.uses starts with "nextstrain/.github/.github/workflows/pathogen-repo-build.yaml@"'
        and name != 'CI'
),

run as materialized (
    select
        workflow.*,

        run.run_number                  as workflow_run_number,
        run.id                          as id,
        run.html_url,
        run.created_at,
        run.conclusion,
        run.status,
        run.event,
        run.head_sha                    as commit_id,
        run.head_commit->>'message'     as commit_msg,

        row_number() over (
            partition by
                repository_full_name,
                workflow_id
            order by run_number desc
        ) as relative_workflow_run_number

    from
        workflow
            join github_actions_repository_workflow_run as run using (repository_full_name, workflow_id)

    where
            -- XXX FIXME: this correlated subquery is a hack around a steampipe issue… describe why, maybe explore a better work around.
            head_branch = (select default_branch from repository r where r.repository_full_name = workflow.repository_full_name)
        and age(run.created_at) <= '90 days'
)

select
    *
from
    run
where
    relative_workflow_run_number <= 30
;
