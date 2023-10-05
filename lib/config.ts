import { readFile } from 'fs/promises'

import { z } from 'zod'

export const githubWebhookEventNames = [
  '*',
  'branch_protection_rule',
  'check_run',
  'check_suite',
  'code_scanning_alert',
  'commit_comment',
  'create',
  'delete',
  'dependabot_alert',
  'deploy_key',
  'deployment',
  'deployment_status',
  'discussion',
  'discussion_comment',
  'fork',
  'github_app_authorization',
  'gollum',
  'installation',
  'installation_repositories',
  'issue_comment',
  'issues',
  'label',
  'marketplace_purchase',
  'member',
  'membership',
  'merge_group',
  'meta',
  'milestone',
  'organization',
  'org_block',
  'package',
  'page_build',
  'ping',
  'project',
  'project_card',
  'project_column',
  'projects_v2_item',
  'public',
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
  'pull_request_review_thread',
  'push',
  'release',
  'repository_dispatch',
  'repository',
  'repository_import',
  'repository_vulnerability_alert',
  'security_advisory',
  'sponsorship',
  'star',
  'status',
  'team',
  'team_add',
  'watch',
  'workflow_dispatch',
  'workflow_job',
  'workflow_run',
] as const

const schema = z.object({
  dryRun: z.boolean().default(true),
  githubToken: z.string(),
  users: z
    .object({
      type: z.union([z.literal('user'), z.literal('org')]),
      username: z.string(),
      webhooks: z
        .object({
          events: z.enum(githubWebhookEventNames).array().min(1),
          url: z.string(),
        })
        .array(),
    })
    .array(),
  unarchiveRepository: z.boolean().default(false),
  cleanUp: z
    .object({
      enabled: z.boolean().default(false),
      ignoredWebhookUrls: z.string().array().default([]),
    })
    .default({
      enabled: false,
      ignoredWebhookUrls: [],
    }),
})

export type Config = z.infer<typeof schema>
export type WebhookConfig = Config['users'][0]['webhooks'][0]
export type UserType = Config['users'][0]['type']

export async function loadConfig(): Promise<Config> {
  const file = await readFile(
    process.env.CONFIG_PATH ?? './config.json',
    'utf-8'
  )
  const json = JSON.parse(file)

  return schema.parse(json)
}
