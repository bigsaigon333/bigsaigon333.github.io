#!/usr/bin/env bash
# playwright install-deps 가 받는 .deb 를 캐시 디렉터리와 주고받는다. 우분투 미러가 느릴 때(115kB/s 까지 떨어진다)
# job 마다 같은 21.9MB 를 다시 받느라 준비가 25초에서 4분까지 늘었다.
# 캐시에서 넣은 .deb 도 apt 가 서명된 색인의 SHA256 과 맞춰 본 뒤에만 설치하므로, 캐시가 오염돼도 다른 패키지가 깔리지 않는다.
#   restore <dir>  캐시의 .deb 를 apt 의 보관함에 넣고, 설치 뒤에도 받은 .deb 를 지우지 않게 한다
#   save <dir>     apt 의 보관함에 있는 .deb 를 캐시 디렉터리로 모은다
set -euo pipefail
dir=$2
archives=/var/cache/apt/archives
case "$1" in
  restore)
    echo 'APT::Keep-Downloaded-Packages "true"; Binary::apt::APT::Keep-Downloaded-Packages "true";' |
      sudo tee /etc/apt/apt.conf.d/99keep-debs > /dev/null
    sudo rm -f /etc/apt/apt.conf.d/docker-clean
    if compgen -G "$dir/*.deb" > /dev/null; then
      sudo cp "$dir"/*.deb "$archives/"
      echo "apt-debs: $(find "$dir" -name "*.deb" | wc -l) cached packages"
    fi
    ;;
  save)
    mkdir -p "$dir"
    if compgen -G "$archives/*.deb" > /dev/null; then cp "$archives"/*.deb "$dir/"; fi
    echo "apt-debs: $(find "$dir" -name "*.deb" | wc -l) packages to cache"
    ;;
  *) echo "usage: $0 restore|save <dir>" >&2; exit 2 ;;
esac
