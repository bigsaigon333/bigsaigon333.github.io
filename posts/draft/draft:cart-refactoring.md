---
title: 장바구니 리팩토링 철학
date: "2022-06-22"
---

## 1. client state와 server state, derived state from server 를 구별한다

장바구니는 그래피컬한 폼과 같다. 옵션 변경, 업셀링을 통해서 장바구니에 추가를 할 수 있다. 수량을 변경할 수 있다. 그에 따라 배달팁이 변경될 수 있다.
옵션 변경, 업셀링, 수량 변경등은 서버에 api 요청을 보내서, 장바구니 싱크를 맞춘다.
api 요청의 결과로 장바구니는 최신의 정보를 서버로부터 받아오게 되고 이를 다시 싱크를 맞춘다.

서버로부터 받은 상태 중에 일부는 주문서 생성을 위해서 제출을 하지만, 일부는 그냥 디스플레이용이다. 유저가 변경을 하기도 한다. 따라서 서버 상태로부터 파생되지만 유저가 변경도 가능한 상태가 되는데, 대표적으로 ProotionItems 가 있다.
이를 서버 파생 상태, derived state from server 로 분류한다.

그에 반해, 바텀시트가 열렸다, 바텀시트 내에 어떤 항목이 들어간다, 바텀시트 애니메이션이 완료되었다 등은 클라이언트 상태이다.

<https://tkdodo.eu/blog/react-query-and-forms>
<https://kentcdodds.com/blog/dont-sync-state-derive-it>

## 2. useQuery를 async state store처럼 사용

### staleTime 설정 필요

react-query는 같은 call stack에 있는 요청을 하나로 묶어서 처리하기 때문에, 여러번 useQuery를 호출하여도 하나의 요청만 보냅니다. 하지만, 다른 call stack에서의 useQuery는 하나로 묶여지지 않습니다. 따라서 staleTime 을 설정하여, 일정 시간내의 호출에 대해서는 기존의 data를 사용하게끔 설정합니다.

임의로 1sec로 해두었으며, 커뮤니티에서는 20sec를 권장한다고 합니다. 새로운 데이터가 필요한 경우 강제로 refetch를 호출하고 있기 때문에 20sec 로 하여도 큰 문제는 없을 듯 합니다.

<https://tkdodo.eu/blog/react-query-as-a-state-manager>

### derived State 최신화

cartQuery의 data가 변경되면, derived state도 변경되어야 합니다.

data가 갱신되지 않았따면 참조값이 동일하므로 이를 이용해서 setState를 할 수도 있으나,

key값을 변경하여 매번 새로운 컴포넌트를 만들어냄으로써 derived State 를 새로 만드는 방법을 채택하였습니다.

<https://reactjs.org/blog/2018/06/07/you-probably-dont-need-derived-state.html>

### 보완점: data의 타입안정성

isSuccess가 아닌 경우는 CartContainer에서 바로 분기처리가 되기 때문에, 하위 컴포넌트에서는 항상 data가 존재하는 것이 보장됩니다.

다만, useQuery에서는 data가 |undefiend 이므로 이를 해결해야 함

현재는 cartResponse 를 하위 컴포넌트에 넘겨서 해결하고 있음 (기존 방법 그대로)

## 3. domain-free hook을 조합해서 새로운 훅을 만든다

useOnceEffect, useBoolean 등 도메인에 종속적이지 않아 공용으로 사용될 수 있는 작은 훅을 여러개 만들고,
이를 조합해서 새로운 훅을 만듭니다.

동일한 기능을 수행하더라도 더 풍부한 표현력을 간단하게 나타내고자 하였습니다.

## 4. 상태 캡슐화

- dispatcher(setState)를 인자로 넘기는 것을 지양. 노출되는 것을 지양

- 사용하는 곳 근처에 상태를 둔다

## 하고 싶었으나 못한 것

1. Container 분리

- 상태를 캡슐화 하여서 상태 간의 의존성을 끊으면, 추후 컨테이너 분리시에 이동이 편리할 것으로 생각됨

2. useQuery를 래핑하고 있는 Query훅에 select를 props로 전달하여 마치 리덕스의 useSelector 처럼 사용하게 하는 것

3. menuStore(mobx) 의존성 제거
