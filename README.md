# PyroHistorian
One consistent fire record across MODIS and VIIRS: a burning-activity calendar for a selected area.
NASA Space Apps Challenge 2026, Universal Event.

Read first: docs/CONTEXT.md, OWNERS.md, docs/INTERFACES.md.

## Setup (each person, once)
    git clone <repo-url> && cd pyrohistorian
    python3 -m venv .venv            # Windows PowerShell: python -m venv .venv
    source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
    pip install -r requirements.txt
Put the FIRMS download folders inside data/raw/ (copy from the shared cloud folder).

## Daily routine
    git pull
    # work ONLY on files you own (OWNERS.md)
    git status                       # only your files may appear
    git add <your folders/files>
    git commit -m "short message"
    git push

## Data acknowledgement
We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System
(FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS).
