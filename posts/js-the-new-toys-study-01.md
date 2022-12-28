---
title: 웹 개발자를 위한 자바스크립트의 모든 것 스터디 1주차
date: "2022-12-28"
---

- 1주차 / 2022-12-27 화 22:00 ~ 24:00
- 범위: 2장 블록 스코프 선언: let과 const

## 책 내용 정리

### 선언, 할당

`var`와 `let`은 변수의 선언에 사용된다.

변수는 선언과 값의 할당을 분리할 수 있다.

선언과 동시에 값을 할당하지 않는다면 `undefined`가 할당된다.

`const`는 상수의 선언에 사용된다.

상수는 값을 변경할 수 없다. 따라서 선언과 값의 할당이 동시에 일어나야 한다.

선언과 동시에 값을 할당하는 것을 초기화라고 한다.

`const`로 선언한 상수에 새 값을 할당하려고 하면 오류가 발생한다.

### 스코프

`var`는 함수 스코프이다. 블록 내에서 선언하더라도 같은 함수 내 블록 외부에서 접근이 가능하다.

`let`과 `const`는 선언된 블록 내에서만 존재한다.

### 반복된 선언

- `var`는 같은 스코프내에서 동일한 변수명으로 여러번 선언할 수 있다.
- `let`과 `const`는 동일한 스코프내에서 동일한 변수명으로 여러번 선언할 수 없다.
  - 코드가 구문 분석될 때 오류가 발생한다.

### 호이스팅과 TDZ

- `var` 변수의 선언은 함수 내 최상단으로 끌어올려진다(호이스팅된다)
- 다만 값의 할당까지 끌어올려지지 않는다. 따라서 `var` 변수를 선언되기 전에 접근하면 undefined가 할당되어 있다.
- `let`과 `const` 변수 또한 함수 내 최상단으로 끌어올려지지만(호이스팅되지만), `let`, `const` 변수/상수에 선언전에 접근할 수 없으며, 이때 `let`,`const` 변수/상수는 TDZ에 있다고 한다. 즉, TDZ에 있는 변수/상수에는 접근할 수 없다.
- TDZ는 공간적이 아니라 시간적인 개념이다. 식별자를 사용할 수 없는 범위가 아니라 식별자를 사용할 수 없는 기간이다.
- 외부 스코프와 내부 스코프에 동일한 변수명을 가진 변수 x가 있을 때, 내부 스코프의 변수 x가 TDZ에 있을 때에 외부 스코프의 변수 x에 접근할 수 없다.

### 전역 속성

- `var`를 사용하여 변수를 선언하면 전역 객체(`globalThis`)의 속성이 된다.
- `let`과 `const`는 전역 객체의 속성이 되지 않는다.

---

## 스터디 내용 정리

### JS spec 보다는 사용법에 초점을

매년 JS spec이 엄청나게 바뀌기 때문에, JS 엔진 제작자가 아닌 이상 spec을 너무 깊게 파고드는 건 낭비이다. JS의 문법적 의미 및 JS를 어떻게 사용해야하는지에 초점을 맞추는게 더 낫다.

예를 들어, 클래스에 private field가 추가되면서 클래스 스펙이 전반적으로 많이 바뀌었다. 따라서 기존에 알고 있던 JS spec 은 현시점에서는 이미 잘못된 내용일 가능성이 높다.

### 알고리즘이란

제어와 상태를 이용해서 문제를 해결하는 것이다.

- 제어: for, if 문 등
- 상태: 변수

### JS에서 코드 실행 시점 제어 방법

아래와 같은 코드는 동기화 코드이다.

동기화 코드는 동기적으로 실행된다: 쌓아놓은 코드가 무조건 전부 한번에 실행되고 그 사이에 개입할 수 없음을 의미한다.

```jsx
a;
b;
c;
```

#### 1. 제어문: 동기실행을 제어하는 특수한 구문

`if if-else switch while for` 등이 있다.

```jsx
a;
if () b;
else c;

// a b 또는 a c
```

#### 2. 논리 연산자

`&&, ||` 등

```jsx
(f() && b()) || (c() && d());

// f b 또는 f c 또는 f c d
```

#### 3. 함수

JS엔진은 함수를 lazy하게 평가한다. 선언할 때 평가하는게 아니라 실행할 때 평가한다.

```jsx
function f() {
  b;
  c;
}

a;
d;
f();

// a d b c
```

### 실행 컨텍스트는 코드가 실행되는 시점에 생성된다

#### 1. 문제 없음

```jsx
function temporalExample() {
  const f = () => {
    console.log(value);
  };
  let value = 42;
  f();
}
temporalExample();
```

#### 2. 문제 있음

```jsx
function temporalExample() {
  const f = () => {
    console.log(value);
  };
  f();
  let value = 42;
}
temporalExample();
```

#### 3. 문제 없음: 지연 실행으로 인한 JS의 특징

코드 실행 시점에 구문 분석이 실행되기 때문이다.

```jsx
function temporalExample() {
  const f = () => {
    console.log(value);
  };

  f();
  let value = 42;
}
// temporalExample();
```

#### ⇒ Best Practice

외부 스코프의 변수에 의존하지 않는 것

```jsx
const f = (value) => console.log(value);
let value = 42;
f(value);
```

### 섀도잉 절대 금지

섀도잉이란 외부 스코프에 선언된 변수명을 내부 스코프의 변수 선언에 중복해서 사용하는 것을 의미한다.

중첩 스코프는 안쓰는게 베스트다. 일반적인 개발자는 감당할 수 없다.

```jsx
// 섀도잉
let member
if () {
  let member
}
```

코드를 짜는 흐름 때문에 2. 로 섀도잉을 피하는게 일반적이나, 1. 도 나쁘지 않다.

```jsx
// 섀도잉을 해결을 위한 두가지 방법

// 1.
let baseMember
if(){
  let member
}

// 2.
let member
if(){
  let vipMember
}
```

### 루프 내 클로저 성능 영향

```jsx
let n;
for(n,,,)

vs

for(let n ...)
```

```jsx
for(let n){
  const f = () => n
} // 매 순회마다 n에 대한 어휘 환경을 만들기 때문에 성능에 영향을 줌

for(let n){
 console.log(n)
} // JS엔진이 최적화를 하기 때문에 성능에 영향 없음
```

### for vs while

```jsx
for(let i) {
}

// for 문 밖에서 i를 쓸 수 없다.
```

```jsx
let i
while(바깥에 있는 변수) {
}

let a
while(a, ~~b~~){ // 외부 스코프에 있는 a는 사용 가능하나, 내부 스코프에 있는 b는 사용할 수 없다.
 let b
}
```

<aside>
💡 while 과 do-while 은 모던 언어에서 차이가 거의 없다. 코틀린은 차이가 있음.

```jsx
// 코틀린은 됨
do{
  let a
} while(a)

do{
내가 뭔가 했어
}
while(잘안되었냐) 가 일반적이라서... 많은 언어에서 도입하려고 함
```

</aside>

### JS의 단점: 함수의 매개변수가 let이다

#### 권장 프랙티스

```jsx
let으로 난리칠곳
const로 정리
const에만 의존하는 알고리즘
```

코드가 상수에 의존하게끔 빨리 바꿔라. 리팩토링을 거대하게 하려고 하지 마라.

```jsx
// AS-IS
function f(a){
  a = 45 // Nooooo!
}

// TO-BE
function f(a){
  const A = a
  A에 의존
}
```

#### 예제

```jsx
let resut;
if() result = 1
else result = 2

// result = 3  Error를 내고 싶다!
```

빨리 할 수 있는 조치

```jsx
let resut;
if() result = 1;
else result = 2;

const resultConfirmed = result;
// resultConfirmed에 의존적인 코드들 ...
result = 3; // 아무영향도 없음
```

⇒ JS는 린트가 필수!
