#!/bin/bash -x

# shellcheck shell=bash

main() {

  local tgz=$(
    cd dist/js
    ls -1
  )

  local subdir=$(echo $tgz | awk -F'@' '{print $1}' | tr -d '-')
  tar -xzf dist/js/$tgz
  rm -rf package/node_modules package/.vscode package/.mergify.yml package/.node-version package/eslint.config.mjs package/$subdir
  tar -czf dist/js/$tgz package
  rm -rf package
  tar -tzf dist/js/$tgz
  find dist/

  return 0
}

main "$@"
