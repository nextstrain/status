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
set intervalstyle = 'iso_8601';

/* Steampipe's conceit of "it's just tables and SQL" has a tendency to break
 * down in the face of complex queries and reveal cracks in the abstraction.
 * When the query planner really rolls up its sleeves and digs in, it can often
 * shuffle around where filter conditions are applied in ways that _really
 * matter_ to Steampipe's operation.  For example, it might move a filter
 * condition from a Steampipe table scan to an outer query plan step if it deems
 * it more efficient to do so.  In the best case, this makes Steampipe's tables
 * slower, i.e. they fetch more data than necessary from the upstream API and
 * filter locally instead of passing the filter thru.  In the worst case,
 * though, it breaks the query because the filter condition was one required by
 * the Steampipe table.¹  The query planner isn't operating with full knowledge
 * here, so can't really be blamed.
 *
 * We, on the other hand, *can* operate with full knowledge and can tailor our
 * Steampipe access patterns (when necessary) to ones that are most efficient
 * (and robust to query plan changes), e.g. maximally filtered list operations
 * and precise get operations.  The clearest way to do this, AFAICT, is to
 * isolate such a Steampipe query within a record- or table-returning
 * function.²  Doing so creates a boundary the query planner won't optimize
 * across.
 *
 * Steampipe tables are essentially RPCs (somewhat elaborate ones), and so
 * wrapping them in functions also makes that reality a bit clearer and easier
 * to keep in mind.  In that vein, if for some future queries we find ourselves
 * not making much use of the wonders of Pg and SQL and relational algebra, we
 * may find it simplifying in those cases to use Steampipe's standalone
 * exporters (which also make clearer the RPC-ness).³
 *   -trs, 18 Dec 2024
 *
 * ¹ e.g. <https://github.com/nextstrain/status/issues/8#issuecomment-2048630861>
 * ² <https://www.postgresql.org/docs/14/xfunc-sql.html#XFUNC-SQL-TABLE-FUNCTIONS>
     <https://www.postgresql.org/docs/14/xfunc-sql.html#XFUNC-SQL-FUNCTIONS-RETURNING-SET>
     <https://www.postgresql.org/docs/14/xfunc-sql.html#XFUNC-SQL-FUNCTIONS-RETURNING-TABLE>
     (Pg 14 because that's what Steampipe CLI currently bundles.)
 * ³ <https://steampipe.io/docs/steampipe_export/run>
 */
-- Gigantic name to parallel the Steampipe table
create or replace function github_actions_repository_workflow_runs_on_branch(
        _repository_full_name text,
        _workflow_id text,
        _head_branch text
    )
    returns setof github_actions_repository_workflow_run
    language sql as $$
        -- Invokes https://api.github.com/repos/{+repo}/actions/runs{?branch} (filters on workflow id locally)
        select *
          from github_actions_repository_workflow_run as run
         where run.repository_full_name = _repository_full_name
           and run.workflow_id          = _workflow_id
           and run.head_branch          = _head_branch
    $$
;

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
        /* Recently learned that dynamic GH Action workflows with path 'dynamic/pages/'
         * are automatically generated by GitHub to deploy GitHub pages with a
         * defined publishing source. These dynamic workflows cause errors during workflow parsing.¹
         * Only include our own GitHub Action workflows under .github/workflows/
         * that can contain pathogen builds.
         *   -Jover, 27 March 2024
         *
         * ¹ <https://github.com/nextstrain/status/issues/6>
         */
        and path like '.github/workflows/%'

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
            (workflow_file_content_json @@ '$.jobs.*.uses starts with "nextstrain/.github/.github/workflows/pathogen-repo-build.yaml@"'
                /* Temporary(?) workaround to include zika/avian-flu's ingest-to-phylogenetic workflows
                 * We may pursue other methods in the future to include workflows that are not
                 * directly using pathogen-repo-build.yaml.
                 *  -Jover, 23 April 2024
                 *
                 * <https://github.com/nextstrain/status/issues/12>
                 */
                or path like '.github/workflows/ingest-to-phylogenetic%.yaml')
        and name != 'CI'
),

run as materialized (
    select
        workflow.repository_full_name,
        workflow.workflow_id,
        workflow.workflow_path,
        workflow.workflow_name,
        workflow.workflow_html_url,

        run.run_number                  as workflow_run_number,
        run.id                          as id,
        run.html_url,
        run.created_at,
        run.updated_at,
        run.conclusion,
        run.status,
        case when run.conclusion is not null
            then run.updated_at - run.created_at
            else current_timestamp(0) - run.created_at
        end                             as duration,
        run.event,
        run.head_sha                    as commit_id,
        run.head_commit->>'message'     as commit_msg,

        row_number() over (
            partition by
                workflow.repository_full_name,
                workflow.workflow_id
            order by run.run_number desc
        ) as relative_workflow_run_number

    from
        workflow,
        github_actions_repository_workflow_runs_on_branch(
            repository_full_name,
            workflow_id,
            (select default_branch from repository r where r.repository_full_name = workflow.repository_full_name)
        ) as run

    where
            age(run.created_at) <= '90 days'
        and run.created_at >= '2024-02-13T21:50:28Z'::timestamptz -- When I merged <https://github.com/nextstrain/.github/pull/54>. —trs
)

select
    json_agg(row_to_json(run.*))
from
    run
where
    relative_workflow_run_number <= 30
;
