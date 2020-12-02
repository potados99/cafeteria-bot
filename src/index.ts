import { Application } from 'probot'

export = (app: Application) => {
  app.log.info('App started!');

  app.on('issues.opened', async (context) => {
    const issueComment = context.issue({ body: 'Thanks for opening this issue!' })
    await context.octokit.issues.createComment(issueComment)
  })

  app.on('issue_comment.created', async (context) => {
     context.log.info(`issue commented!: ${context.payload.comment.body}`)
  })

  app.on('create', async (context) => {
    if (context.payload.ref_type === 'tag') {
      const drafter = new ReleaseDrafter(context);
      await drafter.draftRelease();
    }
  });

}

class ReleaseDrafter {
  private context: any;

  constructor(context: any) {
    this.context = context;
  }

  async draftRelease() {
    this.log(`New tag: ${this.context.payload.ref}`);

    const latestReleaseCommitSha = await this.getLatestReleaseSha();
    this.log(`Latest release(tag)'s commit SHA: '${latestReleaseCommitSha}'`);

    const newCommits = await this.getCommitsSinceLastRelease(latestReleaseCommitSha);
    this.log(`New commits from then: '${newCommits.map((c: any) => c.sha.substring(0, 7)).join(', ')}'`);

    const commitDescriptions = this.createCommitDescriptions(newCommits);

    const releaseBody = this.generateReleaseBody(commitDescriptions);
    this.log(`Release content: '${releaseBody}`);

    await this.pushRelease(releaseBody);
  }

  private getRepoAndOwner() {
    const repoName = this.context.payload.repository.name;
    const ownerName = this.context.payload.repository.owner.login;

    return {repoName, ownerName};
  }

  private async getLatestReleaseSha() {
    const {repoName, ownerName} = this.getRepoAndOwner();

    let latestRelease;
    try {
      latestRelease = await this.context.octokit.repos.getLatestRelease({
        owner: ownerName,
        repo: repoName,
      });
    } catch (e) {
      return null;
    }

    const latestTagName = latestRelease.data.tag_name;

    const latestTag = await this.context.octokit.git.getRef({
      owner: ownerName,
      repo: repoName,
      ref: `tags/${latestTagName}`
    });

    return latestTag.data.object.sha;
  }

  private async getCommitsSinceLastRelease(lastReleaseSha: string) {
    if (!lastReleaseSha) {
      return [];
    }

    const {repoName, ownerName} = this.getRepoAndOwner();

    const comparedResultFromLatestTagWithHead = await this.context.octokit.repos.compareCommits({
      owner: ownerName,
      repo: repoName,
      base: lastReleaseSha,
      head: 'HEAD'
    })

    return comparedResultFromLatestTagWithHead.data.commits;
  }

  private createCommitDescriptions(commits: [any]) {
    return (commits.length > 0) ?
        commits.reverse().map((c) => `[\`${c.sha.substring(0, 7)}\`](${c.html_url}) ${c.commit.message}`).join('    \n') :
        'Initial release!';
  }

  private generateReleaseBody(commitDescriptions: string) {
    return `## 변경 사항🥳 \n\n${commitDescriptions}`;
  }

  private async pushRelease(body: string) {
    const {repoName, ownerName} = this.getRepoAndOwner();
    const newTagName = this.context.payload.ref;

    await this.context.octokit.repos.createRelease({
      owner: ownerName,
      repo: repoName,
      tag_name: newTagName,
      name: newTagName,
      body: body,
    });
  }

  private log(any: any) {
    this.context.log.info(any);
  }
}
