CREATE TYPE vote_value AS ENUM ('Aye', 'Nay', 'Abstain');
CREATE TYPE item_type AS ENUM ('Bill', 'Resolution', 'Motion');

CREATE TABLE councils (
  id INT GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  logged_in BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id)
);

CREATE TABLE agenda_items (
  id INT GENERATED ALWAYS AS IDENTITY,
  item TEXT NOT NULL,
  type item_type NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  council_count INT,
  PRIMARY KEY (id)
);

CREATE FUNCTION new_item() RETURNS trigger AS $new_item$
  DECLARE
    current_council_count INT;
  BEGIN
    SELECT COUNT(*) INTO STRICT current_council_count FROM councils;
    UPDATE agenda_items SET council_count=current_council_count, active=FALSE WHERE id IN (SELECT MAX(id) FROM agenda_items);
    RETURN NEW;
  END;
$new_item$ LANGUAGE plpgsql;

CREATE FUNCTION end_item() RETURNS void AS $$
  DECLARE
    current_council_count INT;
  BEGIN
    SELECT COUNT(*) INTO STRICT current_council_count FROM councils;
    UPDATE agenda_items SET council_count=current_council_count, active=FALSE WHERE id IN (SELECT MAX(id) FROM agenda_items);
  END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER new_item BEFORE INSERT ON agenda_items EXECUTE PROCEDURE new_item();

CREATE TABLE votes (
  id INT GENERATED ALWAYS AS IDENTITY,
  council_id INT REFERENCES councils(id) NOT NULL,
  item_id INT  REFERENCES agenda_items(id) NOT NULL,
  value vote_value NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (council_id, item_id)
);
