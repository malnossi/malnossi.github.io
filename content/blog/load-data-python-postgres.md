+++
title="Loading Data with Python into PostgreSQL with Psycopg 3"
date=2026-01-14
description="Explore the best way to import messy data from remote source into PostgreSQL using Python and Psycopg3. The data is big, fetched from a remote source, and needs to be cleaned and transformed."
[taxonomies]
tags=["Python","PostgreSQL","Data"]
[extra]
[extra.cover]
image="python-sql.png"
+++
# Introduction
As data engineers, or the glorified plumbers of the digital world, our job is to wrestle data from far-flung sources into our databases. Some days, this means working with nicely formatted JSON or YAML. More often, it means dealing with Excel spreadsheets with merged cells or hidden columns, or CSV files that are functioning in unexpected ways.
The data that comes from enterprise systems and legacy apps comes with exotic character sets that have no bearing on anything since the 90's.

Sometimes we work with more up-to-date services that come with decent APIs. More often than that, we're SSH'-ing into ancient SFTP servers because S3 bucket permissions are a nightmare, FTP sites that are essentially time machines, or setting up Windows-exclusive proprietary software just to access that corporate stash because, according to the IT guy, it's “perfectly secure and user-friendly.”

This is the reality of data pipelines, the constant adaptation for every imaginable format, protocol, or idiosyncrasy devised by organizations as a means of data storage and transfer.

# Setup the APi
I found this great [public API for beers](https://punkapi-alxiw.amvera.io/v3/beers?page=1), so we are going to import data to a beer table in the database.
```json
// curl https://punkapi-alxiw.amvera.io/v3/beers?page=1
[
    {
    "id": 1,
    "name": "Punk IPA 2007 - 2010",
    "tagline": "Post Modern Classic. Spiky. Tropical. Hoppy.",
    "first_brewed": "04/2007",
    "description": "Our flagship beer that kick started the craft beer revolution. This is James and Martin's original take on an American IPA, subverted with punchy New Zealand hops. Layered with new world hops to create an all-out riot of grapefruit, pineapple and lychee before a spiky, mouth-puckering bitter finish.",
    "image": "001.png",
    "abv": 6,
    "ibu": 60,
    "target_fg": 1010,
    "target_og": 1056,
    "ebc": 17,
    "srm": 8.5,
    "ph": 4.4,
    "attenuation_level": 82.14,
    "volume": {
      "value": 20,
      "unit": "litres"
    }
    }
 //
]
```
I trimmed the output for brevity, but there is a lot of information about beers here. In this article we want to import all of the fields before `brewers_tips` to a table in the database.

The field `volume` is nested. We want to extract only the value from the field, and save it to a field called volume in the table.
```python
volume = beer['volume']['value']
```
The field `first_brewed` contains only year and month, and in some cases, only the year. We want to transform the value to a valid date. For example, the value 09/2007 will be transformed to date 2007-09-01. The value 2006 will be transformed to date 2016-01-01.

Let's write a simple function to transform the text value in the field, to a Python `datetime.date`:
```python
import datetime

def parse_first_brewed(text: str) -> datetime.date:
    parts = text.split('/')
    if len(parts) == 2:
        return datetime.date(int(parts[1]), int(parts[0]), 1)
    elif len(parts) == 1:
        return datetime.date(int(parts[0]), 1, 1)
    else:
        assert False, 'Unknown date format'
```
# Fetch the Data

The API provides paged results. To encapsulate the paging, we create a generator that yields beers one by one:
```python
from typing import Iterator, Dict, Any
from urllib.parse import urlencode
import requests


def iter_beers_from_api(page_size: int = 30) -> Iterator[Dict[str, Any]]:
    session = requests.Session()
    page = 1
    while True:
        response = session.get('https://punkapi-alxiw.amvera.io/v3/beers?' + urlencode({
            'page': page,
            'per_page': page_size
        }))
        response.raise_for_status()

        data = response.json()
        if not data:
            break

        yield from data

        page += 1
```
# Create a Table in the Database

```yaml
services:
  db:
    image: postgres:17
    environment:
      - POSTGRES_USER=test
      - POSTGRES_PASSWORD=test
      - POSTGRES_DB=test
    ports:
      - 5432:5432
```
```bash
docker compsoe up -d
```
To connect from Python to a PostgreSQL database, we use [psycopg3](https://www.psycopg.org/psycopg3/docs/index.html):

```bash
mkdir pythonpostgresql
cd pythonpostgresql
uv init .
uv add "psycopg[binary]"
```
```python
import psycopg

connection = psycopg.connect(
    host="localhost", 
    dbname="test", 
    user="test", 
    password="test")

connection.autocommit = True

def create_staging_table(cursor) -> None:
    cursor.execute("""
        DROP TABLE IF EXISTS staging_beers;
        CREATE UNLOGGED TABLE staging_beers (
            id                  INTEGER,
            name                TEXT,
            tagline             TEXT,
            first_brewed        DATE,
            description         TEXT,
            image               TEXT,
            abv                 DECIMAL,
            ibu                 DECIMAL,
            target_fg           DECIMAL,
            target_og           DECIMAL,
            ebc                 DECIMAL,
            srm                 DECIMAL,
            ph                  DECIMAL,
            attenuation_level   DECIMAL,
            brewers_tips        TEXT,
            contributed_by      TEXT,
            volume              INTEGER
        );
    """)
````
Using the connection we created before, this is how the function is used:

```python
>>> with connection.cursor() as cursor:
>>> create_staging_table(cursor)
```

# Profile Decorator

```python
import time
import tracemalloc
from functools import wraps

def profile(fn):
    @wraps(fn)
    def inner(*args, **kwargs):
        fn_kwargs_str = ", ".join(f"{k}={v!r}" for k, v in kwargs.items())
        print(f"\n{fn.__name__}({fn_kwargs_str})")

        # Start memory tracking
        tracemalloc.start()

        # Measure time
        t0 = time.perf_counter()
        retval = fn(*args, **kwargs)
        elapsed = time.perf_counter() - t0

        # Stop memory tracking
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        print(f"Time   {elapsed:.4f}s")
        print(f"Memory {peak / 1024 / 1024:.4f} MiB (peak)")

        return retval

    return inner
```
# Benchmark
At the time of writing, the beers API contains only 415 beers. To work on a large dataset, we duplicate it 100 times and store it in-memory. The resulting dataset contains 41,500 beers:
```python
>>> beers = list(iter_beers_from_api()) * 100
>>> len(beers)
41,500
```
In a real life situation you would use the function iter_beers_from_api directly:

```python
>>> process(iter_beers_from_api())
```
## Insert Rows One by One
To establish a baseline we start with the simplest approach, insert rows one by one:

```python
@profile
def insert_one_by_one(conn, beers: Iterator[Dict[str, Any]]):
    
    with conn.cursor() as cur:
        # Reset table
        cur.execute("TRUNCATE TABLE staging_beers")
        # Insert each beer
        for beer in beers:
            cur.execute(
                """
                INSERT INTO staging_beers VALUES (
                    %(id)s,
                    %(name)s,
                    %(tagline)s,
                    %(first_brewed)s,
                    %(description)s,
                    %(image)s,
                    %(abv)s,
                    %(ibu)s,
                    %(target_fg)s,
                    %(target_og)s,
                    %(ebc)s,
                    %(srm)s,
                    %(ph)s,
                    %(attenuation_level)s,
                    %(brewers_tips)s,
                    %(contributed_by)s,
                    %(volume)s
                );
            """,
                {
                    **beer,
                    "first_brewed": parse_first_brewed(beer["first_brewed"]),
                    "volume": beer["volume"]["value"],
                },
            )
```

```bash
insert_one_by_one()
Time   5.9616s
Memory 0.0553 MiB (peak)
```

## Execute Many
Psycopg3 provides a way to insert many rows at once using [executemany](https://www.psycopg.org/psycopg3/docs/api/cursors.html#psycopg.Cursor.executemany). From the docs:
> Execute the same command with a sequence of input data.

Let's try to import the data using executemany:
```python
@profile
def insert_executemany(connection, beers: Iterator[Dict[str, Any]]) -> None:
    with connection.cursor() as cursor:
        create_staging_table(cursor)

        all_beers = [
            {
                **beer,
                "first_brewed": parse_first_brewed(beer["first_brewed"]),
                "volume": beer["volume"]["value"],
            }
            for beer in beers
        ]

        cursor.executemany(
            """
            INSERT INTO staging_beers VALUES (
                %(id)s,
                %(name)s,
                %(tagline)s,
                %(first_brewed)s,
                %(description)s,
                %(image)s,
                %(abv)s,
                %(ibu)s,
                %(target_fg)s,
                %(target_og)s,
                %(ebc)s,
                %(srm)s,
                %(ph)s,
                %(attenuation_level)s,
                %(brewers_tips)s,
                %(contributed_by)s,
                %(volume)s
            );
        """,
            all_beers,
        )
```
The function looks very similar to the previous function, and the transformations are the same. The main difference here is that we first transform all of the data in-memory, and only then import it to the database.

Running this function produces the following output:
```bash
insert_executemany()
Time   1.3268s
Memory 20.1006 MiB (peak)
```
This is disappointing. The timing is just better, but the function now consumes 20MiB of memory.

## Execute Many From Iterator
The previous method consumed a lot of memory because the transformed data was stored in-memory before being processed by psycopg.

Let's see if we can use an iterator to avoid storing the data in-memory:
```python
@profile
def insert_executemany_iterator(connection, beers: Iterator[Dict[str, Any]]) -> None:
    with connection.cursor() as cursor:
        create_staging_table(cursor)

        all_beers = (
            {
                **beer,
                "first_brewed": parse_first_brewed(beer["first_brewed"]),
                "volume": beer["volume"]["value"],
            }
            for beer in beers
        )

        cursor.executemany(
            """
            INSERT INTO staging_beers VALUES (
                %(id)s,
                %(name)s,
                %(tagline)s,
                %(first_brewed)s,
                %(description)s,
                %(image)s,
                %(abv)s,
                %(ibu)s,
                %(target_fg)s,
                %(target_og)s,
                %(ebc)s,
                %(srm)s,
                %(ph)s,
                %(attenuation_level)s,
                %(brewers_tips)s,
                %(contributed_by)s,
                %(volume)s
            );
        """,
            all_beers,
        )
```
The difference here is that the transformed data is "streamed" into executemany using an iterator.

This function produces the following result:
```bash
insert_executemany_iterator()
Time   1.3047s
Memory 0.1355 MiB (peak)
```
Our "streaming" solution worked as expected and we managed to bring the memory to 0.1355 MiB. The timing however, remains roughly the same.

## COPY
The official PostgreSQL documentation includes a dedicated section on Populating a Database, which highlights that the most efficient method for loading large amounts of data is the COPY command. In Python, the psycopg library offers a convenient interface for this through the [`copy`](https://www.psycopg.org/psycopg3/docs/api/cursors.html#psycopg.Cursor.copy) function.
See [Using COPY TO and COPY FROM](https://www.psycopg.org/psycopg3/docs/basic/copy.html#copy) for information about COPY.

```python
@profile
def insert_via_copy(conn, beers: Iterator[Dict[str, Any]]):
    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE staging_beers")
        # Begin a COPY FROM STDIN (text) operation:
        # Note: we specify the column list and a delimiter.
        with cur.copy("COPY staging_beers FROM STDIN") as copy:
            for beer in beers:
                copy.write_row(
                    (
                        beer["id"],
                        beer["name"],
                        beer["tagline"],
                        parse_first_brewed(beer["first_brewed"]),
                        beer["description"],
                        beer["image"],
                        beer["abv"],
                        beer["ibu"],
                        beer["target_fg"],
                        beer["target_og"],
                        beer["ebc"],
                        beer["srm"],
                        beer["ph"],
                        beer["attenuation_level"],
                        beer["brewers_tips"],
                        beer["contributed_by"],
                        beer["volume"]["value"],
                    )
                )
```
```bash
insert_via_copy()
Time   0.2015s
Memory 0.0752 MiB (peak)
```

# Key takeaways 
PostgreSQL’s COPY FROM STDIN vastly outperforms row-by-row inserts and even batched inserts. This is because COPY minimizes per-statement overhead and streaming avoids large in-memory buffers. “The COPY option is the most efficient. Then the executemany. Then the execute”. In other words, the hierarchy is COPY >> executemany >> one-by-one in terms of speed.

# Conclusion

The choice of insertion method has a huge impact when loading large datasets. Our examples illustrate that:

- For small datasets (a few dozen rows), the simplicity of one-by-one inserts is fine. The overhead is negligible.
- For medium datasets, executemany can help reduce Python overhead, but still isn’t truly bulk-loading.
- For large datasets (thousands+ rows), prefer PostgreSQL’s COPY. Psycopg makes it easy to stream rows directly into COPY ... FROM STDIN with copy.write_row, yielding order-of-magnitude speedups and minimal memory usage.

A few additional best practices highlighted by the code:

- Use a single requests.Session for API calls to reuse connections.
- Normalize or clean data before insert (e.g. parse dates) to avoid database errors.
- For staging tables where durability isn’t needed, use UNLOGGED tables. These skip WAL logging and can be much faster (often >50% faster) for bulk loads.

> Remember that COPY bypasses normal ORM or trigger mechanisms (not shown here), so any auto-generated timestamps or foreign-key cascades won’t run. Design your pipeline accordingly.

By combining streaming fetch (iterators), careful parsing, and PostgreSQL’s efficient COPY command, we can build a robust ingestion process that handles “messy” remote data at scale with high performance.