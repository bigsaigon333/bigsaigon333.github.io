---
title: Date Time String Format in JS
date: "2022-08-30"
---

JS에서 Date 객체를 생성하기 위해 Date 생성자를 이용할 수 있습니다.

Date 생성자의 시그니쳐는 아래와 같이 다양합니다.

```js
new Date();
new Date(value);
new Date(dateString);
new Date(dateObject);

new Date(year, monthIndex);
new Date(year, monthIndex, day);
new Date(year, monthIndex, day, hours);
new Date(year, monthIndex, day, hours, minutes);
new Date(year, monthIndex, day, hours, minutes, seconds);
new Date(year, monthIndex, day, hours, minutes, seconds, milliseconds);

Date();
```

## 1. ISO 8601

JS에서는 날짜 표기 형식인 ISO 8601 에 따라서 나타낸 문자열을 적법한 날짜 표기 문자열으로 보아, 이를 `Date.parse` 매소드의 인자로 전달하면 UNIX Timestamp 값을 반환합니다. 만약 부적절한 날짜 표기 문자열인 경우에는 `NaN`을 반환합니다.
(※ 브라우저의 세부 구현에 따라 ISO 8601 형식을 완벽하게 따른 문자열이 아니더라도 정상적인 날짜 표기 문자열으로 파싱되는 경우도 있습니다.)

위에서 Date 생성자의 인자로 전달되는 `dateString`이 바로 ISO 8601에 따른 날짜 표기 문자열입니다.

ISO 8601에 따른 날짜 시간 문자열의 구체적인 형식은 다음과 같습니다.

`YYYY-MM-DDTHH:mm:ss.sssZ`

- `T`는 날짜와 시간을 구분하기 위한 구분자 역할입니다.
- `Z`는 타임존을 나타냅니다. `Z`만 기재한 경우에는 UTC+00:00을 나타내며, `+09:00` 로 기재하는 경우 UTC+09:00 을, `-09:00` 로 기재하는 경우 UTC-09:00 을 나타냅니다.
  - 타임존은 생략이 가능한 선택기재사항입니다. 만약 생략하게 되면 현재 구동환경의 로컬타임존으로 간주됩니다.

## 2. 문제상황

현재 시각이 특정 기간 내인 경우에만 특정 이미지가 노출되도록 하는 기능을 작업하고 있습니다.

특정 기간은 고정된 기간이어서, 직접 코드에 상수로 추가하는 방식을 채택하게 되었습니다. 현재 회사의 api서버에 api 요청을 보내면 항상 응답값의 body에 `serverDatetime` 을 넣어서 반환해주고 있는데, 이 `serverDatetime`이 특정 기간에 포함되는지 여부를 클라이언트에서 판단하도록 작업하게 되었습니다.

여기서 문제는 `serverDatetime`에는 `2022-08-29T18:00:00` 과 같이 타임존이 빠져있는 문자열이어서, 사용자의 구동환경에 따라서 동일한 문자열이 다른 시간으로 파싱될 수 있다는 점입니다.

예를 들어 `serverDatetime` 이 `2022-08-29T18:00:00` 인 경우, UTC+09:00 인 한국에서 실행하는 경우 `2022-08-29T18:00:00+09:00` 이 되어 `2022-08-29T09:00:00Z` 가 되지만, UTC+01:00 인 영국에서 실행하는 경우 `2022-08-29T18:00:00+01:00` 이 되어 `2022-08-29T17:00:00Z` 과 일치하게 됩니다.

## 3. 해결방안

저희 회사의 서비스는 한국에서만 사용되므로 실제 사용자 환경이 한국과 다른 타임존일 경우는 거의 없습니다. 하지만 디바이스 자체의 타임존 설정을 변경하는 방식으로 타임존을 변경한다면, 동일한 `serverDatetime`이 특정 기간에 포함되는지 여부를 어뷰징 할 수 있게 됩니다.

`serverDatetime`에는 타임존이 붙어 있지 않지만 회사의 모든 서버는 한국에 존재하므로 UTC+09:00 임이 전제되어 있습니다.

따라서 `2022-08-29T18:00:00+09:00` 와 같이 타임존을 추가하는 함수를 한번 거친 문자열을 사용하게 하여, `serverDatetime`이 항상 정확한 시간을 나타내며, 사용자의 디바이스 타임존 변경에 따른 어뷰징을 막을 수 있었습니다.

## 4. 참고링크

- <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse#date_time_string_format>

- <https://tc39.es/ecma262/#sec-date-time-string-format>

- <https://en.wikipedia.org/wiki/ISO_8601>
