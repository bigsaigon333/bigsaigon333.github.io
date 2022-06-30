---
title: safari on iOS 에서 빠르게 두번 터치하는 경우 click event 좌표 보정 이슈
date: "2022-06-30"
---

## I. 문제점

iOS 13 버젼 이상의 브라우저에서 각기 다른곳에 터치를 빠르게 두 번 하는 경우,
click event의 clientX, clientY 좌표가 최초 터치한 곳이 두 번 터치된 것처럼 보정이 되어 동일한 곳의 click event handler가 두 번 실행되는 문제가 있었다.

React: 17.0.2
iOS: 13버젼 이상
브라우저: 웹뷰, 사파리 등 모두다

## II. 다양한 의문점

### 1. 리액트?

native html input type checkbox 요소만 있는 mdn 사이트를 모바일에서 열어서 확인하면
해당 현상은 발생하지 않았다.
리액트의 문제인가 라는 의심도 생겼다.

<https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/checkbox#handling_multiple_checkboxes>

또한 캐치테이블이라는 타사 서비스에서도 동일한 현상을 발견하였다. 해당 서비스와의 유사성은 리액트뿐이었다.

### 2. touchstart, touchend 이벤트는 좌표 보정이 일어나지 않는다

터치 이벤트에서는 좌표 보정이 일어나지 않았다.

touchstart -> touchmove -> touchend -> click -> touchstart -> touchmove -> touchend -> click -> dblclick 순으로 이벤트가 실행될 때
두 번의 click과 dblclick 이벤트의 clientX, clientY 만 보정된 값으로 들어온다.

## III. 원인

### 1. dblclick 이벤트 핸들러가 설정되어 있으면 iOS에서 MouseEvent의 좌표 값을 보정한다

근데 나는 dblclick 이벤트 핸들러를 설정한 적이 없는데?

### 2. 리액트는 #root 엘리먼트에 모든 이벤트 핸들러를 등록해놓고, 버블링 된 nativeEvent를 캐치하여 Synthetic Event로 래핑하여 이벤트를 발생시킨다

즉, 리액트를 쓰는 이상 dblclick 이벤트 핸들러가 무조건 하나 이상 등록되어 있는 것이다.

## IV. 해결방법

### 1. click 이벤트 핸들러를 사용하지 않는다

input type checkbox 가 change event handler 였다면...

### 2. touchend 에서 event.preventDefault()를 호출하면 추후의 click 이벤트가 발생되지 않는다

<!-- - stopImmediatePropagation / stopPropagation / preventDefault
- innerHTML 로 script 태그를 생성하면 src 를 로드하지 않는다?
- 환경변수:
  다국어: 기능과 상관없는 디스플레이 등 -->
