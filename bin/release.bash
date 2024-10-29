#!/bin/bash -x

# shellcheck shell=bash

main() {

  gh release create $(cat dist/releasetag.txt) -R "$GITHUB_REPOSITORY" -F dist/changelog.md -t $(cat dist/releasetag.txt) --target "$GITHUB_REF"

  return 0
}

main "$@"
