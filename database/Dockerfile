FROM postgres:18

COPY setup.sql /docker-entrypoint-initdb.d/

# Authoritative client-auth config, kept outside the data volume so it
# can't be silently mutated at runtime. Referenced via `-c hba_file=`.
COPY pg_hba.conf /etc/postgresql/pg_hba.conf