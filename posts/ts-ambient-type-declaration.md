---
title: Ambient Type Declaration
date: "2022-05-07"
category: 개발
---

타입스크립트의 타입 선언은 `.ts, .tsx` 확장자를 가진 파일에서도 할 수 있지만 `.d.ts` 확장자를 가진 파일에서도 할 수 있습니다.

## I. 앰비언트 타입 선언

`.d.ts` 확장자를 가진 파일에서는 타입 선언만 할 수 있고 값을 표현할 수는 없습니다. 값을 포함하는 일반적인 선언과 구별하기 위해 `d.ts` 확장자를 가진 파일에서 하는 타입 선언에 앰비언트(ambient; 주위의, 주변의)라는 표현을 붙여 **앰비언트 타입 선언**이라고 부릅니다.
앰비언트 타입 선언으로 값을 정의할 수는 없지만, `declare` 라는 특별 키워드를 사용해 자바스크립트의 다른 어딘가에 값이 있다는 사실을 선언할 수 있습니다.

```ts
declare let appVersion: string;
```

`declare` 는 "나의 자바스크립트는 이 타입을 익스포트함을 맹세한다"라고 선언하는 것이라 생각하면 좋습니다.

또 다른 특징으로는 명시적으로 `export` 하지 않은 앰비언트 타입 선언은 마치 전역 변수와 같이 명시적으로 `import` 하지 않더라도 어디서든 사용할 수 있다는 점입니다.

## II. 언제 앰비언트 타입 선언이 주로 사용되나요

`.ts, .tsx`확장자를 가진 파일에서는 타입 선언과 구현을 모두 할 수 있으므로 일반적으로 앰비언트 타입 선언을 사용하여 타입 선언과 구현을 분리할 필요는 없습니다. 그럼 반대로 타입 선언과 구현을 같이 할 수 없는 상황을 생각해 보면, 언제 앰비언트 타입 선언을 사용해야 하는지 알 수 있습니다.

### 1. 타입 선언이 없는 자바스크립트로 작성된 서드 파티 라이브러리

DefinitelyTyped 를 잠시 잊어보겠습니다. 자바스크립트로 작성된 npm library 가 있다고 가정해보겠습니다. 자바스크립트로 구현하였기에 이에 대한 타입 선언은 없습니다.
타입스크립트에서 사용은 가능하나 타입 선언이 없으므로 import 한 모듈은 모두 any 로 추론될 것이며, tsconfig.json 설정에서 any 사용을 금지하였다면 빌드되지 않을 것입니다.
이러한 경우에 앰비언트 타입 선언을 사용할 수 있습니다. 앰비언트 타입 선언으로 자바스크립트 라이브러리 내 함수, 변수들의 타입을 선언하면, 타입스크립트는 컴파일 시에 자동으로 `d.ts` 확장자를 가진 파일을 검색해서 타입 체킹에 이용하므로 문제없이 컴파일됩니다. vscode와 같은 코드 편집기도 `d.ts` 확장자를 가진 파일을 읽어 해석한 다음 코드 작성시 유용한 타입 힌트를 제공합니다.

DefinitelyTyped 에 있는 라이브러리가 하는 일이 방금 저희가 한 일입니다.
예를 들어 @types/react 를 `npm install -D` 하면 node_modules/@types/react 에 index.d.ts, global.d.ts 가 설치됩니다. 여기에 리액트의 컴포넌트, 훅에 대한 타입이 정의가 되어 있습니다. 그리고 tsc는 별도의 설정을 해주지 않더라도 node_modules/@types 디렉토리에 있는 타입 선언을 타입 체킹에 이용합니다.
또한 vscode는 index.d.ts, global.d.ts를 이용하여 타입 힌트를 제공합니다.

즉, 앰비언트 타입 선언은 타입스크립트에 "자바스크립트에는 이런저런 정보가 정의되어 있어"라고 알려주는 수단으로 생각할 수 있습니다.

### 2. 타입스크립트로 작성된 서드 파티 라이브러리

서드 파티 라이브러리는 타입스크립트로 작성되더라도 자바스크립트 파일과 `d.ts` 파일으로 배포되는 것이 일반적입니다.

타입스크립트 파일을 배포하여 라이브러리 사용자가 타입스크립트를 컴파일할 때 라이브러리 코드도 포함해서 컴파일하게 할 수도 있으나, 자바스크립트 파일과 `d.ts` 파일로 배포하면 라이브러리 파일을 또 컴파일할 필요가 없어 컴파일 시간을 크게 줄여줍니다. 또한 `d.ts` 파일이 있으므로 당연히 타입 관점에서 동일한 기능을 제공할 수 있습니다.
tsconfig.json의 `declaration`을 true 로 설정하면 타입스크립트는 컴파일 시 `d.ts` 파일을 자동으로 생성합니다.

### 3. 프로젝트 어디에서나 전역으로 이용할 수 있는 타입을 정의하여 임포트 없이 바로 사용하고자 할 때

앰비언트 타입 선언은 전역 변수와 같습니다. 따라서 앰비언트 타입 선언으로 타입을 선언하면 모든 코드 내에서 import 하지 않고 사용할 수 있습니다. 예를 들어 정말 유용한 타입 유틸 함수를 작성했다고 가정해보겠습니다. 그렇다면 앰비언트 타입 선언으로 타입 유틸 함수를 선언한다면 더이상 명시적으로 모든 코드에 import하지 않더라도 사용할 수 있습니다. 마치 내장 타입 유틸 함수인 것 처럼 말이죠.

```ts
// src/index.d.ts
type Optional<T extends object, K extends keyof T = keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

// src/components.ts
type Props = { name: string; age: number; visible: boolean };
type OptionalProps = Optional<Props>; // Expect: { name?: string; age?: number; visible?: boolean; }
```

### 4. 자바스크립트 어딘가에 전역 변수가 정의되어 있음을 타입스크립트에 알릴 때

타입스크립트로 직접 구현하지는 않았지만 실제로는 자바스크립트 어딘가에 전역 변수가 정의되어 있음을 타입스크립트에 알릴 때 사용합니다.

예를 들어 웹뷰 개발시 네이티브앱과의 통신을 위한 인터페이스를 네이티브앱이 윈도우 객체에 추가하는 경우가 많습니다. 즉, 타입스크립트로 직접 구현을 하지는 않았지만 실제로 해당 변수(자바스크립트의 함수는 일급 객체이므로 변수의 범위에 함수도 당연히 포함됩니다)가 정의되어 있어 런타임에서 해당 변수를 사용할 수 있습니다.

예를 들어 deviceId, appVersion, latitude, longitutde 같은 값을 네이티브 앱에서 window 전역 객체에 할당해준다고 하겠습니다. 이러한 window 객체의 프로퍼티는 실제로 타입스크립트로 정의한 값이 아니므로 타입스크립트는 window 객체의 타입에 이러한 속성이 없는 것으로 판단하여 이러한 속성에 접근하려고 하면 window 객체에 존재하지 않는 프로퍼티라는 에러를 방출하게 됩니다.
따라서 global namespace에 있는 Window 객체에 해당 프로퍼티가 정의되어 있다는 것을 나타내기 위해 앰비언트 타입 선언을 이용합니다.

```ts
declare global {
  interface Window {
    deviceId: string | undefined;
    appVersion: string;
    latitude: string | undefined;
    longitude: string | undefined;
  }
}
```

## III. 언제 앰비언트 타입 선언을 사용하는 것이 좋은가?

### ❌ 타입스크립트로 라이브러리 개발시

tsconfig.json의 `declaration`을 true 로 설정하면 타입스크립트는 컴파일 시 `d.ts` 파일을 자동으로 생성하므로, 수동으로 `d.ts`를 작성할 필요가 없습니다.
따라서 타입스크립트로 라이브러리 개발시에는 앰비언트 타입 선언을 사용할 필요가 없습니다.

### ❌ 프로젝트 어디에서나 전역으로 이용할 수 있는 타입을 정의하여 import 없이 바로 사용하기 위해

앰비언트 타입 선언은 마치 프로토타입에 메서드를 추가하는 것과 같습니다. 서로 다른 라이브러리에서 동일한 이름의 앰비언트 타입 선언을 한다면 충돌이 발생하여 어떤 타입 선언이 적용되는지 알 수 없고, 원하는대로 동작하지 않을 수 있습니다. 또한 명시적인 import, export가 없기 때문에 의존성 관계가 보이지 않아 추후 변경이 어려울 수 있습니다. 따라서 전역으로 이용하기 위한 타입도 `.ts` 파일에 작성하고 명시적으로 import 하는 것을 추천합니다.

### 🤔 DefinitelyTyped에 타입 선언이 존재하지 않는 라이브러리에 타입 추가시

이런 라이브러리는 사용하지 않는 것이 좋습니다. 다른 대안을 찾아보세요. 타입을 직접 추가해야하는 라이브러리를 사용하기 위해 동료들을 설득하는 것은 라이브러리에 타입을 추가하는 것보다 더 힘든 일입니다.

### ✅ 타입스크립트로 정의하지는 않았지만 실행시에는 존재하는 인터페이스 정의시

#### 1. webpack 등의 번들러는 json, css, image 파일등을 모듈로 취급합니다

하지만 타입스크립트는 json, css, image 파일의 모듈을 타입을 알 수 없기 때문에 앰비언트 모듈 선언을 해주어야 합니다. `react-scripts`를 사용하는 경우, `react-app.d.ts`에 이미 정의되어 있어 별도의 설정이 필요하지 않을 수도 있습니다

```ts
// node_modules/react-scripts/lib/react-app.d.ts
declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.webp" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  import * as React from "react";

  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & { title?: string }
  >;

  const src: string;
  export default src;
}
```

#### 2. 전역변수 확장

웹뷰 개발시 네이티브앱과의 통신을 위한 인터페이스를 window 객체에 추가하는 경우가 많습니다. 이러한 경우에는 앰비언트 타입 선언을 사용하여야 합니다.

## IV. 앰비언트 타입 선언을 잘못 썼을 때 문제점

### 1. 앰비언트 타입 선언은 의존성 관계가 보이지 않기 때문에 변경의 영향 범위 파악이 어렵습니다

명시적인 import, export 없이 코드 전역에서 사용할 수 있기 때문입니다. 소스 코드의 규모가 큰 경우 추후 변경이 어려울 수 있습니다.

### 2. 타입스크립트로 정의하지는 않았지만 실행시 존재하는 인터페이스는 배포 시점 관리가 중요합니다

네이티브 앱과의 인터페이스가 수정이 될 경우, window 객체를 확장한 앰비언트 타입 선언도 이에 맞추어 수정되어야 합니다. 원활한 커뮤니케이션으로 네이티브 앱 인터페이스 변경 시점과 웹뷰 변경 시점을 잘 맞추어야 합니다.

### 3. .ts 파일 내 앰비언트 변수 선언은 개발자에게 혼란을 야기합니다

`declare` 키워드를 이용한 앰비언트 변수 선언은 `d.ts` 파일이 아닌 `.ts`, `.tsx` 파일 내에서도 가능합니다.

```tsx
// src/index.tsx
import React from "react";
import ReactDOM from "react-dom";
import App from "App";

declare global {
  interface Window {
    JavaScriptInterface: {
      getCommonInfo: (callbackString: string) => void;
    };
    getCommonInfoCallback?: (jsonStr: string) => void | undefined;
  }
}

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
);
```

그러나 앰비언트 변수 선언과 일반 타입 선언이 섞이게 되면, 어떤 파일에 앰비언트 선언이 포함되어 있는지 관리가 어럽게 됩니다. 위의 예제에서는 window 전역 객체의 확장이고 src/index.tsx 라는 최상위 파일에서 앰비언트 변수 선언을 하여서 그나마 파악이 쉬우나, 어떤 작은 컴포넌트에 앰비언트 변수 선언이 포함되어 있어 모든 파일의 타입에 영향을 미친다면 굉장히 관리가 어려울 수 있습니다.

앰비언트 타입 선언을 `d.ts`에서 한다는 것은 개발자들간의 약속입니다. 있어야 할 곳에 있어야 할 것이 있는 코드가 가독성도 높고 이해하기도 쉽고, 유지보수하기도 편한 코드일 것입니다.
