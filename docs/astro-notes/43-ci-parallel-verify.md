# 43. CI 시간 단축: 재서 나누기, 그리고 dependabot

## 한 줄 요약

PR 한 번에 6분 30초 걸리던 CI 를 job 의 시간을 재서 가장 긴 줄을 쪼개는 것만으로 줄였다. 검사는 하나도 빼거나 약하게 하지 않았고, 캐시는 새로 만들지 않았다. 의존성 갱신은 dependabot 이 `astro` 로 PR 을 보낸다.

## 개념

- **임계 경로**: 병렬 job 의 전체 시간은 가장 늦게 끝나는 job 이 정한다. 변경 전에는 selftest 조각 하나(5분 40초)가 정했고 나머지 둘은 2~3분 만에 끝났다. 사례를 id 순서로 번갈아 나누면 무거운 사례(`interactions`, `perf`, `visual`)가 한 조각에 몰릴 수 있다.
- **쪼개도 필수 검사 이름은 그대로**: 보호 규칙은 `checks / verify` 같은 이름을 본다. `verify` 를 matrix(`verify (rest|browser|perf)`)로 나누고, 이름이 `verify` 인 집계 job 이 모든 조각이 `success` 일 때만 통과한다. `verify selftest` 가 이미 그 방식이다.
- **빠짐 없이 나누기**: `rest` 묶음은 `scripts/verify/checks/*.mjs` 에서 `perf`·`visual`·`interactions`·`hover` 를 뺀 나머지로 정해서 새 검사가 저절로 들어간다. 이름을 적은 묶음의 검사가 없어지면 `--only` 가 모르는 검사로 거부한다.
- **perf 는 혼자**: Lighthouse 는 옆에서 다른 브라우저 검사가 돌면 수치가 흔들린다(`lib/runner.mjs` 의 `exclusive`). 러너를 따로 주면 오히려 더 안정적이다.
- **캐시를 더하지 않은 이유**: 기준선 빌드는 4초, 빌드는 2~5초다. 병목은 브라우저 검사였고, 브라우저 캐시는 이미 playwright 버전 키로 있다.
- **dependabot**: 설정 파일은 기본 브랜치(main)에서 읽힌다. `target-branch: astro` 로 PR 이 작업 브랜치에 모이고, `ci.yml` 은 브랜치 제한 없는 `pull_request` 라 그 PR 에도 같은 검사가 돈다.

## Next.js 대응

Vercel 은 빌드를 한 곳에서 돌리고 검사는 별도 CI 에 맡기는 경우가 많다. 여기서는 검사가 배포의 관문이라 검사 시간이 곧 배포 시간이다. 그래서 job 을 쪼개는 방식이 중요하다.

## 빌드 결과물에서 확인하기

`dist/` 는 달라지지 않는다. 실행 기록에서 본다.

```sh
gh run view <id> --json jobs --jq '.jobs[] | "\(.name) \(.startedAt) \(.completedAt)"'
```

job 마다 시작과 끝, 가장 늦게 끝난 job 이 전체 시간이다. 단계별은 `--json jobs` 의 `.steps[]` 에 있다.

## 닫힌 고리가 잡아낸 것

- 처음 추측("기준선 빌드 캐시가 크다")은 틀렸다. 단계별 시간을 보니 `verify:setup` 이 4초였다. 재기 전에 캐시를 만들었다면 복잡함만 늘었을 것이다.
- 쪼갠 뒤에도 한 조각이 5분을 넘긴 적이 있다. 사례가 아니라 준비 단계(`setup-browser`)가 느린 러너였다. 조각을 더 늘려도 이런 지연은 못 줄이므로 여러 번 재야 한다.

## 직접 해볼 실험

1. 로컬에서 `node scripts/verify/selftest.mjs --shard=1/12 --list` 로 조각마다 사례를 보고, `--only=<검사>` 로 검사 하나의 selftest 시간을 잰다.

<details>
<summary>예상 결과</summary>

`interactions`·`perf`·`visual` 이 가장 오래 걸리고(각각 40~70초), 나머지는 대부분 1초 안팎이다.

</details>

2. `gh run list --workflow=ci.yml -L 5` 에서 두 실행의 job 시작·끝을 비교해 가장 늦게 끝난 job 을 찾는다.

<details>
<summary>예상 결과</summary>

변경 전에는 `verify selftest (1/3)`, 변경 뒤에는 `verify (perf)` 나 가장 무거운 selftest 조각이 가장 늦다.

</details>

## 문서 근거

- https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow
- https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference
