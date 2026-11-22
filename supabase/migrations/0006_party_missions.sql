-- Approved party additions only: preserve host edits and disabled base tasks.
-- Apply after the house-rule exception is deployed. Safe to re-run.
-- Run the complete file in one transaction. No player/game records are changed.
insert into missions (text, difficulty, category)
values
  ('Get them to let you try on an accessory or item of their clothing, such as a hat, glasses, scarf, or jacket.', 'M', 'Try something playful'),
  ('Get them to play one round of the penis game with you: take turns saying "penis" louder until one of you gives up.', 'H', 'Try something playful'),
  ('Get them to compare hand sizes with you.', 'E', 'Try something playful'),
  ('Get them to pinky-promise you something.', 'M', 'Try something playful'),
  ('Get them to say "that''s what she said."', 'M', 'Try something playful'),
  ('Get them to clink glasses with you and say "cheers."', 'E', 'Around the bar'),
  ('Get them to let you choose their next drink.', 'M', 'Around the bar'),
  ('Get them to do a shot with you (water counts).', 'M', 'Around the bar'),
  ('Get them to make a toast.', 'M', 'Around the bar'),
  ('Get them to guess your drink.', 'M', 'Around the bar'),
  ('Get them to identify the song currently playing.', 'M', 'Around the bar'),
  ('Get them to explain how to make their favorite cocktail.', 'M', 'Around the bar'),
  ('Get them to compliment your outfit.', 'E', 'Around the bar'),
  ('Get them to guess your age.', 'E', 'Around the bar'),
  ('Get them to tell you their go-to drunk food.', 'E', 'Around the bar'),
  ('Get them to tell you their worst hangover story.', 'M', 'Around the bar'),
  ('Get them to start a friendly conversation with another bar patron who isn''t part of the party (not bar staff).', 'H', 'Around the bar'),
  ('Get them to say "where''s my drink?"', 'E', 'Around the bar'),
  ('Get them to say "I''m not even drunk."', 'M', 'Around the bar'),
  ('Get them to play one round of rock-paper-scissors with you.', 'E', 'Around the bar'),
  ('Get them to guess how long you''ve known Afam.', 'M', 'Around the bar'),
  ('Get them to use the word "moist" in a sentence.', 'M', 'Around the bar'),
  ('Get them to tell you about a time they called someone by the wrong name.', 'M', 'Around the bar'),
  ('Get them to make up a handshake with you.', 'M', 'Simple mischief'),
  ('Get them to say "pickle."', 'M', 'Simple mischief'),
  ('Get them to say "squirrel."', 'M', 'Simple mischief'),
  ('Get them to say "flamingo."', 'M', 'Simple mischief'),
  ('Get them to say "nipple."', 'M', 'Simple mischief'),
  ('Get them to say "belly button."', 'M', 'Simple mischief'),
  ('Get them to do finger guns at you.', 'E', 'Simple mischief'),
  ('Get them to use air quotes.', 'M', 'Simple mischief'),
  ('Get them to wink at you.', 'E', 'Simple mischief'),
  ('Get them to make a heart with their hands.', 'E', 'Simple mischief'),
  ('Get them to play a thumb war with you.', 'E', 'Simple mischief'),
  ('Get them to give you a nickname.', 'M', 'Simple mischief')
on conflict (text) do update
  set difficulty = excluded.difficulty,
      category = excluded.category,
      active = true;

-- Keep historical IDs but retire tasks covered by the new handshake, existing
-- dance move, or existing show/movie recommendation.
update missions set active = false
where text in (
  'Get them to invent and perform a three-step handshake with you',
  'Get them to teach you a handshake',
  'Get them to do a tiny dance in the middle of the bar.',
  'Get them to tell you the best think they are watching on TV right now'
);
