#!/usr/bin/env bash
# Creates the three release labels release-on-merge.yml depends on.
#
# One-time repository setup, run by a maintainer with repo admin rights. It is
# deliberately not a workflow: CI's token is read-only, and label creation is
# configuration rather than per-pull-request work. The ship skill applies one
# of these labels to a pull request; CI reads it on merge and performs the bump.
#
# Idempotent - re-running updates colors and descriptions in place.

set -euo pipefail

gh label create release:patch --color 0E8A16 \
  --description "Merge triggers a patch release" --force
gh label create release:minor --color 1D76DB \
  --description "Merge triggers a minor release" --force
gh label create release:major --color B60205 \
  --description "Merge triggers a major release" --force

echo "release:* labels are in place."
