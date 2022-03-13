---
title: 글자 간격 조정하기
date: "2022-03-13"
summary: letter-spacing 속성을 이용하여 글자 간격을 설정한다
---

글자를 조금 넓게 출력하도록 글자 간격을 넓히고 싶은 경우 css의 letter-spacing 속성을 사용할 수 있습니다.

```css
h1 {
  font-size: 15vw;
  letter-spacing: 0.2em;
  margin-left: 0.2em;
}
```

letter-spacing은 각 글자의 오른쪽 부분에 여백을 넣습니다. 마지막 글자의 오른쪽 부분에도 여백이 들어가므로 그냥 사용하면 왼쪽과 오른쪽의 균형이 깨져서 중앙에서 약간 어긋난 위치에 배치되어 버립니다. 따라서 margin-left를 사용해 첫 번째 글자 왼쪽에도 letter-spacing 만큼의 여백이 들어가게 해서 왼쪽과 오른쪽의 균형을 맞추어야 합니다.

## Reference

최신 표준 HTML + CSS 디자인 / EBISUCOM / p49
