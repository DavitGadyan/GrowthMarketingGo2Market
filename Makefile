# GrowthPilot - run the API and the web app together.
#   make install   install both halves
#   make dev       run backend (:8000) + frontend (:3000); Ctrl-C stops both
#   make demo      same as dev, with deterministic fake agents (no API key needed)
#   make test      backend tests + frontend build
ROOT    := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
BACKEND := $(ROOT)backend
WEB     := $(ROOT)output/growthpilot
PY      := $(BACKEND)/.venv/bin/python

.PHONY: install dev demo test backend web

install:
	cd $(BACKEND) && uv venv .venv --python 3.12 && uv pip install --python .venv/bin/python --only-binary :all: -r requirements.txt
	npm --prefix $(WEB) install

backend:
	cd $(BACKEND) && .venv/bin/uvicorn app.main:app --reload --port 8000

web:
	npm --prefix $(WEB) run dev

dev:
	@trap 'kill 0' INT TERM; \
	( cd $(BACKEND) && .venv/bin/uvicorn app.main:app --reload --port 8000 ) & \
	( npm --prefix $(WEB) run dev ) & \
	wait

demo:
	@GROWTHPILOT_FAKE_AGENTS=1 $(MAKE) dev

test:
	cd $(BACKEND) && GROWTHPILOT_FAKE_AGENTS=1 .venv/bin/python -m pytest -q
	npm --prefix $(WEB) run build
