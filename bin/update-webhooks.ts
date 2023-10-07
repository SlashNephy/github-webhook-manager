import { Octokit } from '@octokit/rest'

import { elementsEqual } from '../lib/array.ts'
import { loadConfig } from '../lib/config.ts'
import { listGitHubRepositories } from '../lib/github/listGitHubRepositories.ts'
import { listGitHubRepositoryWebhooks } from '../lib/github/listGitHubRepositoryWebhooks.ts'

import type { Config, WebhookConfig } from '../lib/config.ts'
import type { GitHubRepository } from '../lib/github/listGitHubRepositories.ts'
import type { GitHubRepositoryWebhook } from '../lib/github/listGitHubRepositoryWebhooks.ts'

async function main() {
  const config = await loadConfig()
  const octokit = new Octokit({
    auth: config.githubToken,
  })

  const repositories = await Promise.all(
    config.users.map(async (user) =>
      listGitHubRepositories(octokit, user.type, user.username)
    )
  ).then((r) => r.flat())

  await Promise.all(
    repositories.map(async (repository) =>
      updateGitHubRepository(octokit, repository, config)
    )
  )
}

async function updateGitHubRepository(
  octokit: Octokit,
  repository: GitHubRepository,
  config: Config
) {
  const webhookConfigs = config.users.find(
    (user) => user.username === repository.owner.login
  )?.webhooks
  if (!webhookConfigs) {
    console.warn(
      `[${repository.owner.login}/${repository.name}] cannot find webhook config`
    )

    return
  }

  // Webhook を更新する権限がない
  if (!repository.permissions?.admin) {
    console.warn(
      `[${repository.owner.login}/${repository.name}] cannot update webhook because you do not have admin privileges. Skipping...`
    )

    return
  }

  if (!config.unarchiveRepository && repository.archived) {
    console.warn(
      `[${repository.owner.login}/${repository.name}] cannot update webhook because repository is archived. Skipping...`
    )

    return
  }

  const existingWebhooks = await listGitHubRepositoryWebhooks(
    octokit,
    repository.owner.login,
    repository.name
  )

  const updates = webhookConfigs
    .map(({ events, url }) => {
      const existingWebhook = existingWebhooks.find(
        (webhook) => webhook.config.url === url
      )

      // 更新する必要はない
      if (existingWebhook && elementsEqual(events, existingWebhook.events)) {
        return null
      }

      // イベントを更新
      if (existingWebhook) {
        return async () => {
          await octokit.repos
            .updateWebhook({
              hook_id: existingWebhook.id,
              owner: repository.owner.login,
              repo: repository.name,
              events,
            })
            .then(() => {
              console.info(
                `[${repository.owner.login}/${repository.name}] updated webhook`
              )
            })
        }
      }

      // Webhook を作成
      return async () => {
        await octokit.repos
          .createWebhook({
            owner: repository.owner.login,
            repo: repository.name,
            name: 'web',
            active: true,
            events,
            config: {
              url,
              content_type: 'json',
              insecure_ssl: 0,
            },
          })
          .then(() => {
            console.info(
              `[${repository.owner.login}/${repository.name}] created webhook`
            )
          })
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))

  const orphanedWebhooks = findOrphanedWebhooks(
    existingWebhooks,
    webhookConfigs,
    config.cleanUp.ignoredWebhookUrls,
    repository
  )
  if (config.cleanUp.enabled && orphanedWebhooks.length > 0) {
    updates.push(
      ...orphanedWebhooks.map((webhook) => {
        return async () => {
          await octokit.repos
            .deleteWebhook({
              hook_id: webhook.id,
              owner: repository.owner.login,
              repo: repository.name,
            })
            .then(() => {
              console.info(
                `[${repository.owner.login}/${repository.name}] cleaned up orphaned webhook: ${webhook.config.url}`
              )
            })
        }
      })
    )
  }

  if (updates.length > 0) {
    console.info(
      `[${repository.owner.login}/${repository.name}] need to apply ${updates.length} updates...`
    )
  }

  // 更新の必要なし
  if (config.dryRun || updates.length === 0) {
    return
  }

  if (config.unarchiveRepository && repository.archived) {
    updates.unshift(async () => {
      console.info(
        `[${repository.owner.login}/${repository.name}] repository is archived. trying to unarchive...`
      )

      await octokit.repos.update({
        owner: repository.owner.login,
        repo: repository.name,
        archived: false,
      })
    })
    updates.push(async () => {
      console.info(
        `[${repository.owner.login}/${repository.name}] repository was originally archived. archiving...`
      )

      await octokit.repos.update({
        owner: repository.owner.login,
        repo: repository.name,
        archived: true,
      })
    })
  }

  for (const update of updates) {
    // eslint-disable-next-line no-await-in-loop
    await update()
  }
}

function findOrphanedWebhooks(
  webhooks: GitHubRepositoryWebhook[],
  webhookConfigs: WebhookConfig[],
  ignoredWebhookUrls: string[],
  repository: GitHubRepository
): GitHubRepositoryWebhook[] {
  return webhooks.filter((webhook) => {
    // Web hook のエラーを調べる
    const { code } = webhook.last_response
    if (
      code &&
      (code < 200 || code >= 300) &&
      // Too Many Requests は許可
      code !== 429
    ) {
      console.warn(
        `[${repository.owner.login}/${repository.name}] webhook has error(s): ${webhook.config.url}`
      )
    }

    const isOrphaned =
      webhook.config.url &&
      webhookConfigs.findIndex(
        (webhookConfig) => webhookConfig.url === webhook.config.url
      ) === -1 &&
      !ignoredWebhookUrls.includes(webhook.config.url)
    if (isOrphaned) {
      console.warn(
        `[${repository.owner.login}/${repository.name}] found obsolete webhook: ${webhook.config.url}`
      )
    }

    return isOrphaned
  })
}

main().catch(console.error)
