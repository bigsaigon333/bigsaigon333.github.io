---
title: react-scripts 에서 Promise.any polyfill 추가하기
date: "2022-06-01"
---

## I. 문제점

iOS 13 버젼의 기기에서 `Promise.any is not a function.` TypeError가 발생하여 `Promise.any`를 사용하는 기능들이 동작하지 않는 이슈가 발생하였다.

`react-app-polyfill`을 import 하고 있고, .browerslistrc 에 iOS 11 이상도 명시해두었기에 `Promise.any`의 polyfill도 자동으로 추가될 것이라 생각하였으나, 실제로는 추가되지 않은 것으로 보여졌다.

### 현황

```json
// package.json
"dependencies": {
  "react-scripts": "^5.0.0",
  "react-app-polyfill": "^3.0.0",
}
```

```tsx
// index.tsx
import "react-app-polyfill";
```

#### `Promise.any`의 지원범위

![image](https://user-images.githubusercontent.com/31029000/170509567-cd21e2e3-d0f1-4efe-b20f-a1d3ca5de839.png)

## II. 해결책을 찾기 위한 접근방법

### 1. react-app-polyfill 의 동작방법 조사

`react-app-polyfill`은 `core-js/stable` 과 `runtime-generator` 를 import 하는 것이 동작의 전부이다.

`runtime-generator`는 iterator-iterable 프로토콜과 관련된 polyfill 이므로, `Promise.any` 와는 전혀 관련이 없다.

`core-js/stable`은 `core-js` 에 존재하는 수많은 polyfill 중 proposals를 제외한 stable한 기능의 polyfill만을 추가한다. 어떤 기능이 stable한 것인지는 `core-js` 버젼에 따라 상이하며, [링크](https://github.com/zloirock/core-js/blob/master/packages/core-js-compat/src/modules-by-versions.mjs)에서 `core-js` 버젼별 stable한 기능을 확인할 수 있다.

### 2. @babel/preset-env 동작방법 조사

`babel`은 트랜스파일 과정에서 `@babel/preset-env` 을 이용하여 기존의 코드를 target 환경에서 동작하는 구문으로 변경하는데, target 환경이 지원하지 않는 JS 최신 문법이라면 polyfill을 추가할 수 있다. 단, `core-js`를 import하는 것이 필수적이다.

`@babel/preset-env`의 옵션 중 `useBuilltIns` 은 `@babel/preset-env` 가 어떻게 polyfill을 다룰 것인지 조정하는 옵션으로, `"usage" | "entry" | false` 의 값을 가질 수 있으며 default 값은 `false`이다. `false` 인 경우에는 polyfill을 추가하지 않는다.

#### useBuiltIns: "usage"

`"usage"`로 설정한 경우, 기존의 코드에서 사용중인 기능을 target 환경에서 지원하지 않는다면 해당 기능에 대한 polyfill만 트랜스파일 시 추가한다.

```js
// 트랜스파일 전
const m = new Map();
```

```js
// 트랜스파일 후

// target 환경이 Map을 지원하지 않는 경우
import "core-js/modules/es.map";

const m = new Map();

// target 환경이 Map을 지원하는 경우
const m = new Map();
```

#### useBuiltIns: "entry"

`"entry"` 로 설정한 경우, 기존의 코드내에서 어떤 기능을 사용하는지 상관없이 target 환경이 지원하지 않는 모든 기능의 polyfill을 추가한다. 이 때 `@babel/preset-env`는 `import "core-js/stable";` 구문을 target 환경이 지원하지 않는 기능에 대한 polyfill 각각의 모듈 import로 변경한다.

```js
// 트랜스파일 전
import "core-js/stable";
```

```js
// 트랜스파일 후
import "core-js/modules/es.string.pad-start";
import "core-js/modules/es.string.pad-end";
// ...
```

target 환경이 지원하지 않는 기능을 판단하기 위해 `@babel/preset-env`에 `"corejs"` 로 버젼을 지정할 수 있다. 실제로 설치된 `core-js` 버젼과 무관하게, 지정해준 `corejs` 버젼에 의해 어떤 polyfill의 import로 변경되는지가 결정된다.

<https://babeljs.io/docs/en/babel-preset-env#usebuiltins-entry>

<https://babeljs.io/docs/en/babel-preset-env#corejs>

### 3. babel-preset-react-app 동작방법 조사

`react-scripts` 는 내부적으로 `babel-preset-react-app` 이라는 라이브러리를 사용해서 babel 의 각종 preset을 설정하고 있다.

`babel-preset-react-app` 은 위에서 언급한 `@babel/preset-env` 외에도 `@babel/preset-react`, `@babel/preset-typescript` 등 각종 preset을 처리한다.

## III. 문제의 원인 파악

`babel-preset-react-app`은 `@babel/preset-env`를 설정할 때 다음과 같은 옵션값을 주고 있다.

```js
{
  presets: [
    // Latest stable ECMAScript features
    require("@babel/preset-env").default,
    {
      // Allow importing core-js in entrypoint and use browserlist to select polyfills
      useBuiltIns: "entry",
      // Set the corejs version we are using to avoid warnings in console
      corejs: 3,
      // Exclude transforms that make all code slower
      exclude: ["transform-typeof-symbol"],
    },
    // ...
  ];
}
```

`@babel/preset-env` 의 옵션으로 `useBuiltins`에는 `"entry"`로, `corejs` 는 3을 할당하고 있다.

따라서 `import "react-app-polyfill"` 에 의해 import 되는 `"core-js/stable"`을 각각의 개별적인 polyfill 모듈으로 변환 할 때 corejs 3.0.0 을 기준으로 어떤 기능이 stable한지를 판단한다.
(3 은 문자열로 변환시 "3" 이고 이는 semver 기준 "3.0.0"을 의미함)

**corejs 3.7부터 `Promise.any`는 stable한 기능에 포함되기 때문에 `Promise.any`는 proposals에 해당하여 Promise.any에 대한 polyfill 은 추가되지 않았던 것이다.**

<https://github.com/zloirock/core-js/blob/master/packages/core-js-compat/src/modules-by-versions.mjs>)

## IV. 해결책

`react-app-rewired` 로 `react-scripts`의 `webpack` 설정을 변경할 수 있지만, `react-scripts`의 직접적인 `webpack` 설정이 아닌 `react-scripts`의 내부에서 사용되는 `babel-preset-react-app` 의 설정을 변경하여야 하므로, 불가능한 건 아니지만 매우 번거롭고 현실적으로 어렵다고 볼 수 있다.

따라서 core-js를 별도로 설치한 후에 `Promise.any`의 polyfill을 명시적으로 import 해준다.

```js
import "core-js/proposals/promise-any";
import "react-app-polyfill";
```

`core-js` 3.0.0 기준 `Promise.any`는 proposals 이므로, `"core-js/proposals/promise-any"`를 import 한다.
