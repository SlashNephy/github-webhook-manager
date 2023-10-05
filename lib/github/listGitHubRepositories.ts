import type { UserType } from '../config'
import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'

export type GitHubRepository =
  | RestEndpointMethodTypes['repos']['listForUser']['response']['data'][0]
  | RestEndpointMethodTypes['repos']['listForAuthenticatedUser']['response']['data'][0]

export async function listGitHubRepositories(
  octokit: Octokit,
  type: UserType,
  username: string
): Promise<GitHubRepository[]> {
  switch (type) {
    case 'user': {
      const authenticatedUser = await octokit.users.getAuthenticated()
      if (authenticatedUser.data.login === username) {
        console.info(`user is authenticated: ${username}`)

        return octokit.paginate(octokit.repos.listForAuthenticatedUser, {
          affiliation: 'owner',
          per_page: 100,
        })
      }

      return octokit.paginate(octokit.repos.listForUser, {
        username,
        per_page: 100,
      })
    }
    case 'org':
      return octokit.paginate(octokit.repos.listForOrg, {
        org: username,
        per_page: 100,
      })
    default:
      throw new Error(`unknown user type: ${type}`)
  }
}
