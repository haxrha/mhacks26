# AWS hosting

```
Browser ──https──▶ AWS Amplify (apps/web, auto-deploys from main)
   │
   └──wss──▶ EC2 t3.small (Elastic IP, <ip>.sslip.io)
               docker compose: Caddy (TLS) → SpacetimeDB ← Orchestrator (AI, Sonnet 5.5)
```
No SSH: the instance only opens ports 80/443. Admin access is through **SSM Session Manager**. Secrets live in **SSM Parameter Store**. Pushing to `main` redeploys automatically through GitHub Actions + OIDC, with no AWS keys stored in GitHub.

## One-time setup (~15 min)

### 1. AWS CLI + login
```powershell
winget install Amazon.AWSCLI
aws configure            # access key from IAM, region e.g. us-east-2 (Ohio, closest to Ann Arbor)
aws sts get-caller-identity
```

### 2. Store the Anthropic key (optional: without it, AI survivors use the rule engine only)
```powershell
aws ssm put-parameter --name /mhacks26/anthropic_api_key --type SecureString --value "sk-ant-..."
```

### 3. Create the server
```powershell
aws cloudformation deploy --stack-name mhacks26 --template-file infra/aws/stack.yaml --capabilities CAPABILITY_IAM
aws cloudformation describe-stacks --stack-name mhacks26 --query "Stacks[0].Outputs" --output table
```
If the account already has a GitHub OIDC provider, add `--parameter-overrides CreateGitHubOIDCProvider=false`.
First boot takes ~3–5 min. Check with `curl https://<GameHost>`.

### 4. Hook up auto-deploys
GitHub repo → Settings → Secrets and variables → Actions → **Variables**:
- `AWS_DEPLOY_ROLE_ARN` = the `GitHubDeployRoleArn` output
- `GAME_INSTANCE_ID` = the `InstanceId` output
- `AWS_REGION` = your region

Pushes that touch `spacetime/`, `apps/orchestrator/`, or `infra/` then run `infra/aws/deploy.sh` on the server.

### 5. Website on Amplify
AWS Console → Amplify → *Deploy an app* → GitHub → `john-yang-11/mhacks26`, branch `main`, enable **monorepo** with app root `apps/web` (uses `amplify.yml`). Add the env var `NEXT_PUBLIC_SPACETIME_URI` = the `SpacetimeUri` output. Do this once `apps/web` exists.

## Day-to-day
- **Shell on the server:** `aws ssm start-session --target <InstanceId>` (needs the Session Manager plugin), then `cd /opt/game/infra && sudo docker compose logs -f`
- **Manual redeploy:** Actions tab → *Deploy game server* → Run workflow
- **Cost:** about $15–20/mo for t3.small + Elastic IP, covered by credits. **After MHacks:** `aws cloudformation delete-stack --stack-name mhacks26` deletes everything.

## To verify on the first real deploy
- The SpacetimeDB container's `start` flags and data path (in `docker-compose.yml`) against the current self-hosting docs.
- That the `publisher` service can build our module. If the image lacks the toolchain (Rust/wasm or Node), swap it for a small Dockerfile that installs it.
