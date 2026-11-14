# Data sources (Owner A fills the blanks)
NASA FIRMS active fire downloads, JSON, placed in data/raw/ (NOT in git; share via cloud storage).

| Product folder | What it is (verify in its Readme.txt) | Role |
|---|---|---|
| DL_FIRE_M-C61_817682 | MODIS Collection 6.1 | legacy |
| DL_FIRE_SV-C2_817684 | VIIRS S-NPP 375 m, Collection 2 | new |
| DL_FIRE_J1V-C2_817683 | VIIRS NOAA-20 375 m, Collection 2 | reserve (unused at first) |

Each folder has fire_archive_*.json (standard, final quality) and fire_nrt_*.json (recent, preliminary).
Policy in the config: nrt_policy = only_after_archive_end.
Fill in: area downloaded, date range of each file, download date, FIRMS terms/acknowledgement checked.
