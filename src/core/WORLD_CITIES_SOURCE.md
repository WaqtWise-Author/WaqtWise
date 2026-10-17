# Source of world-cities.json

The cities (name, region, latitude, longitude, population) come from **GeoNames** (https://www.geonames.org),
licensed under **Creative Commons Attribution 4.0** (https://creativecommons.org/licenses/by/4.0/), through the
copy "cities500.json" in the GitHub repository lmfmaier/cities-json. Only cities with 15,000 people or more are kept.

The time zone of each city is the nearest place of the same country in the IANA time zone database (zone.tab).

`tools/build-world-cities.py` makes the file again from those two sources.
