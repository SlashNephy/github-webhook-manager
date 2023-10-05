import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'

export type GitHubRepositoryWebhook =
  RestEndpointMethodTypes['repos']['listWebhooks']['response']['data'][0]

export async function listGitHubRepositoryWebhooks(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<GitHubRepositoryWebhook[]> {
  return octokit.paginate(octokit.repos.listWebhooks, {
    owner,
    repo,
  })
}
