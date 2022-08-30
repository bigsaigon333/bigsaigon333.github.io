---
title: 타입스크립트에서 undefined의 쓰임새
date: "2022-08-22"
---

undefined와 null은 비슷하지만 다르다.

동등 연산자(`==`)로 비교해보면 `undefined == null // true`이다.

`Number(undefined) === NaN` 인 반면, `Number(null) === 0` 이다.

undefined는 자바스크립트에만 존재하는 특별한 개념이라고 보는 것이 옳다.

그에 반해 다른 언어들에서도 null은 찾아볼 수 있다.

서버와 ajax 로 api 통신을 하는 모던 웹앱에서,

js 로 작성되는 클라이언트 사이드에는 undefined가 존재하지만

jvm 위에서 돌아가는 서버에는 undefined는 존재하지 않는다.

왜냐하면 JSONd의 정의에는 undefined가 없기 때문이다.

객체를 JSON 직렬화하면, ... 값이 undefined 인 프로퍼티는 제거된다.

undefined를 JSON 직렬화하면 반환되는 값이 없어, undefined가 반환된다.

undefined와 null의 차이는 매우 많다.

모던 웹앱에서 undefined의 쓰임새는 극히 제한된다.
let으로 선언한 변수에 초기값을 할당하지 않은 경우, undefined로 초기화되지만,
모던 웹앱에서는 대부분의 변수를 const로 선언하여 불변값으로 유지하기 때문에 undefined로 초기화되는 let 선언 변수는 안티패턴으로 간주되어 거의 볼 수 없다.

리액트에서도 마찬가지이다. 상태는 변경할 수 있으나, 상태의 초기값을 undefined로 하는 경우는 극히 드물다. react-query 같은 경우 useQuery의 data 값의 초기값이 undefined로, idle 상태의 값을 undefined로 나타낸다

그러나 의외로 undefined를 명시적으로 할당하는 경우가 프로젝트에서 꽤 있는데, 대표적으로 두가지의 이유 때문이라고 할 수 있다.

### 1. 객체를 JSON 직렬화 시 undefined 값을 가진 프로퍼티를 제거하기 위해

JSON의 정의에는 undefined는 없다. 따라서 `JSON.stringify(undefined)`는 undefined 이다. 이는 `JSON.stringify()` 와 같은 결과로서, 직렬화 할 대상이 없어서 결과값도 없다는 의미이다.

`JSON.stringfy({a: undefined})`를 하면 a 속성은 제거되어 `{}` 가 반환된다.

서버에 ajax 통신으로 post 요청을 보내는 경우, body에 보낼 payload에 어떤 속성이 optional인 경우, 자주 사용하게 된다.

### 2. 함수의 인자가 optional인 경우, 값을 undfined 로 설정하여 optional을 흉내낸다

함수의 인자가 undefined인 경우, default parameter가 적용되나 null인 경우는 적용되지 않는다

optional이라는 뜻은 인자가 존재하거나, 존재하지 않거나를 의미한다.

하지만, 인자는 항상 존재하되 해당 값을 undefined로 할당하여 optional한 값을 종종 나타내곤 한다.

엄밀한 의미에서 잘못된 표현이나, 실무에서 흔히 쓰이는 패턴이다.

### 3. `?? undefined` 같은 괴랄한 코드를 보게 된다

null 을 undefined로 거르기 위해 사용된다.

## 대안1. null과 undefined의 차이를 분명히 한다

완전히 분리해서 쓸 것인지, ...

null과 undefined 를 동일하게 두고, 각 타입 내에서 의미를 부여한다

예를 들어 string 의 '' 과 null 과 undefined가 모두 동일한 의미를 가지는가?

## 대안2. tsconfig 설정을 통해 optional과 undefined를 분리한다

객체에서는 `{...{true ? {a: "Hello"} : null}}` 과 같은 형식으로 a를 optional하게 다룰 수 있다. 하지만 이를
`{...a: true ? 'Hello" : undefined}` 와 같이 쓰고 있는 형국이다
