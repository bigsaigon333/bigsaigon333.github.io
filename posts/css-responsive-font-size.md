---
title: 브라우저 화면의 너비에 따라 폰트 크기를 변경하기
date: "2022-03-13"
summary: 폰트 크기를 "vw"라는 단위로 설정합니다.
---

폰트 크기를 `vw`라는 단위로 설정합니다.

`vw`는 화면의 너비를 `100vw`로 하는 단위입니다. 따라서 `1vw`는 화면 너비의 100분의 1입니다.

기존에는 화면 너비를 변경시켜가며 특정 브레이크포인트를 기준으로 폰트 크기를 일일히 변경해주었습니다.

#### 변경전 코드

```js
export const Title = styled.h1`
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-weight: 800;

  font-size: 3.5rem;
  column-gap: 2rem;

  @media (max-width: 767px) {
    font-size: 3.25rem;
    column-gap: 1rem;
  }

  @media (max-width: 600px) {
    font-size: 2.5rem;
  }

  @media (max-width: 375px) {
    font-size: 2rem;
  }

  @media (max-width: 320px) {
    font-size: 1.75rem;
  }

```

대응할 가장 작은 화면 너비인 `280px` 에서 폰트 크기가 `21px`이 되게끔 설정합니다.

`1vw = 2.8px` 이므로 `21px = 7.5vw` 입니다.

또한 iPad Mini의 화면 너비`768px`을 기준으로 화면의 너비가 그 이상인 경우에는 폰트 크기를 `3.6rem(57.6px)`으로 고정하여 폰트 크기가 너무 크게 변하지 않게 만들었습니다.

#### 변경후 코드

```js
export const Title = styled.h1`
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  font-weight: 800;

  font-size: 3.6rem;
  column-gap: 2rem;

  @media (max-width: 767px) {
    font-size: 7.5vw;
    column-gap: 1rem;
  }

```
