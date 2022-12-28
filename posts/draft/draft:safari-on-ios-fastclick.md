---
title: safari on iOS 에서 빠르게 두번 터치하는 경우 click event 좌표 보정 이슈
date: "2022-06-30"
---

## I. 문제점

iOS 13 버젼 이상의 모바일 웹브라우저에서 서로 다른 곳(A, B)에 클릭 이벤트 핸들러를 설정한 후 A,B를 빠르게 터치하는 경우,
A, B의 클릭 이벤트 핸들러가 순차적으로 실행되는 것이 아니라 A의 클릭 이벤트 핸들러가 두번 실행되는 문제가 발생하였다.

[//]: # "test gif 넣기"

실행되는 클릭 이벤트 핸들러의 이벤트 객체를 살펴본 결과, `event.clientX`, `event.clientY`자체가 A의 위치로 보정되어 있었다.

### 실행환경

- React: 17.0.2
- iOS: 13버젼 이상
- 브라우저: 웹뷰, 사파리, 크롬

## II. 의문점

### 1. 리액트의 문제인가?

리액트와 같이 프레임워크를 사용하지 않고 순수 html인 `input[type=checkbox]`으로 구성된 [사이트](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/checkbox#handling_multiple_checkboxes)를 모바일에서 테스트해본 결과, 클릭 이벤트의 좌표가 보정되는 문제는 발생하지 않았다.

[//]: # "mdn gif"

또한 '캐치테이블' 이라는 타사 서비스에서도 동일한 문제가 재현된다는 것을 발견하였는데, 해당 서비스와의 유사성은 오직 리액트를 사용하고 있다는 점 뿐이었다.

[//]: # "캐치테이블 gif"

### 2. 터치 이벤트는 보정되지 않고, 클릭 이벤트만 보정되는 것인가?

터치가 가능한 디바이스에서 터치 이벤트와 클릭 이벤트의 발생 순서는 다음과 같다.

```
touchstart
    ⬇
touchmove
    ⬇
touchend
    ⬇
mousemove
    ⬇
 mouseup
    ⬇
  click
```

> https://w3c.github.io/touch-events/#mouse-events

터치 이벤트 핸들러를 부착하여 테스트해본 결과, touchstart, touchmove, touchend 이벤트와 같은 터치 이벤트에서는 좌표 보정이 일어나지 않았다.

## III. 원인

### 1. dblclick 이벤트 핸들러가 설정되어 있으면 iOS에서 MouseEvent의 좌표 값을 보정한다

[//]: # "mousemove, mouseup 에서도 보정되는지 확인해보기"

II. 1의 순수 html `input[type=checkbox]`의 경우에도 dblclick 이벤트 핸들러를 부착한 경우에는 클릭 이벤트의 좌표 보정이 발생하였다.

따라서 dblclick 이벤트 핸들러가 부착된 요소 주위를 두 번 터치하면, 해당 요소가 두 번 클릭한 것처럼 iOS에서 클릭 이벤트의 좌표를 자동으로 보정해주는 것으로 추정된다.

### 2. 리액트의 루트 엘리먼트는 모든 이벤트 핸들러를 등록하고 있다

내가 만든 화면의 어느 곳에서도 dblclick 이벤트 핸들러를 등록하지 않았다.

하지만 리액트는 루트 엘리먼트에 모든 이벤트 핸들러를 등록한다. 실제로 이벤트가 발생하는 경우, 버블링 된 native 이벤트를 캐치한 후 이를 Synthetic Event로 래핑한 후에 이벤트를 다시 발생시킨다.

[//]: # "확인 필요"

따라서 리액트를 사용하는 이상 쵝상단 루트 엘리먼트에 항상 dblclick 이벤트 핸들러가 등록되어 있으므로, 루트 엘리먼트의 자손에게 클릭 이벤트의 좌표 보정이 항상 발생하게 된다.

## IV. 해결방법

### 1안. click 이벤트 핸들러를 사용하지 않는다

change 이벤트 핸들러를 사용한다. 내가 사용한 체크박스 컴포넌트는 사실 div 로 구성되어 있고, 여기에 click 이벤트 핸들러를 부착한 형태였다. 따라서 이를 `input[type=checkbox]`로 변경하고 change 이벤트 핸들러로 제어한다면 문제가 없다.
하지만, 해당 체크박스 컴포넌트는 이미 굉장히 다양한 곳에서 사용되고 있어서 이를 수정하면 발생할지도 모르는 수많은 사이드 이펙트가 염려되어 실제로 변경은 하지 못하였다.

### 2안. 터치 이벤트만 사용한다

click 이벤트 핸들러가 아니라 `touchstart` 또는 `touchend` 이벤트 핸들러를 사용한다. 하지만 이는 웹접근성 측면에서 좋지 않은 것으로 판단되었다. (기존에도 키보드에 대응하지 않고 있어서 그리 웹접근성이 좋았던 건 아니지만...)

### 최종채택안. 터치 이벤트 핸들러와 클릭 이벤트 핸들러를 모두 사용하되, 터치 이벤트 이후의 클릭 이벤트가 발생되지 않도록 한다

touchend 이벤트 핸들러에서 `event.preventDefault()`를 호출하여 터치 이벤트 후에 발생하는 클릭 이벤트를 취소할 수 있씁니다.

> If, however, either the touchstart, touchmove or touchend event has been canceled during this interaction, no mouse or click events will be fired, and the resulting sequence of events would simply be:
>
> 1. touchstart
> 2. Zero or more touchmove events, depending on movement of the finger
> 3. touchend
>
> https://w3c.github.io/touch-events/#mouse-events

<!-- - stopImmediatePropagation / stopPropagation / preventDefault
- innerHTML 로 script 태그를 생성하면 src 를 로드하지 않는다?
- 환경변수:
  다국어: 기능과 상관없는 디스플레이 등 -->
