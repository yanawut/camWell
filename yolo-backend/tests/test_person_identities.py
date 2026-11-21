import numpy as np

import room_analytics as ra

SEATED = np.array([100.0, 100.0, 200.0, 400.0])
WIDE_DUPLICATE = np.array([100.0, 100.0, 320.0, 400.0])
NEIGHBOUR = np.array([400.0, 100.0, 500.0, 400.0])


def identities(hold_frames=3, box_follow=1.0, settle_frames=1000, seat_hold_frames=3, floor_creep_px=0.5,
               chair_memory=15):
    return ra.PersonIdentities(min_conf=0.30, same_person_overlap=0.6, hold_frames=hold_frames, box_follow=box_follow,
                               settle_frames=settle_frames, seat_hold_frames=seat_hold_frames, held_yield_overlap=0.25,
                               min_body_share=0.10, floor_creep_px=floor_creep_px, chair_iou=0.7, chair_conf=0.15,
                               chair_memory=chair_memory, seat_leave_share=0.5, held_replace_iou=0.3,
                               held_replace_share=0.4)


def ids(shown):
    return sorted(person.id for person in shown)


def test_a_second_box_on_the_same_person_is_not_a_second_person():
    people = identities()
    people.update([(1, SEATED, 0.8)])

    shown = people.update([(1, SEATED, 0.8), (2, WIDE_DUPLICATE, 0.5)])

    assert ids(shown) == [1]


def test_two_boxes_appearing_together_on_one_person_count_once():
    assert len(identities().update([(1, SEATED, 0.5), (2, WIDE_DUPLICATE, 0.8)])) == 1


def test_the_shown_box_does_not_flip_to_the_duplicate_shape():
    people = identities()
    people.update([(1, SEATED, 0.5)])

    shown = people.update([(1, SEATED, 0.5), (2, WIDE_DUPLICATE, 0.9)])

    assert shown[0].box.tolist() == SEATED.tolist()


def test_a_sudden_box_shape_change_is_eased_in():
    people = identities(box_follow=0.5)
    people.update([(1, SEATED, 0.8)])

    shown = people.update([(1, SEATED + [0, 0, 0, 100], 0.8)])

    assert shown[0].box.tolist() == (SEATED + [0, 0, 0, 50]).tolist()


def test_a_box_shape_change_does_not_move_the_person_on_the_floor():
    people = identities()
    start = people.update([(1, SEATED, 0.8)])[0].ground.tolist()

    taller = people.update([(1, SEATED + [0, 0, 0, 100], 0.8)])[0]
    wider = people.update([(1, SEATED + [0, 0, 120, 100], 0.8)])[0]

    assert taller.ground.tolist() == start
    assert wider.ground.tolist() == start


def test_a_person_walking_moves_on_the_floor():
    people = identities()
    start = people.update([(1, SEATED, 0.8)])[0].ground

    moved = people.update([(1, SEATED + [20, 10, 25, 15], 0.8)])[0].ground

    assert (moved - start).tolist() == [20, 10]


def test_people_side_by_side_stay_separate():
    assert ids(identities().update([(1, SEATED, 0.8), (2, NEIGHBOUR, 0.8)])) == [1, 2]


def test_a_person_stays_on_screen_through_a_short_detection_gap():
    people = identities(hold_frames=2)
    people.update([(1, SEATED, 0.8)])

    assert ids(people.update([])) == [1]
    assert ids(people.update([])) == [1]
    assert people.update([]) == []


def test_a_new_track_where_someone_was_just_seen_keeps_their_id():
    people = identities()
    people.update([(1, SEATED, 0.8)])
    people.update([])

    assert ids(people.update([(9, SEATED, 0.7)])) == [1]


def test_a_person_who_really_left_gets_a_new_id_on_return():
    people = identities(hold_frames=1)
    people.update([(1, SEATED, 0.8)])
    people.update([])
    people.update([])

    assert ids(people.update([(9, SEATED, 0.7)])) == [9]


def test_a_faint_track_is_hidden_until_it_has_been_confident_once():
    people = identities()

    assert people.update([(1, SEATED, 0.2)]) == []
    assert ids(people.update([(1, SEATED, 0.5)])) == [1]
    assert ids(people.update([(1, SEATED, 0.15)])) == [1]


def test_a_track_that_walks_off_a_seated_person_becomes_its_own_person():
    people = identities()
    people.update([(1, SEATED, 0.8)])
    people.update([(1, SEATED, 0.8), (2, SEATED + [10, 0, 10, 0], 0.7)])

    shown = people.update([(1, SEATED, 0.8), (2, NEIGHBOUR, 0.7)])

    assert ids(shown) == [1, 2]
    assert shown[0].box.tolist() == SEATED.tolist()
    assert shown[1].box.tolist() == NEIGHBOUR.tolist()


def test_a_person_keeps_their_id_when_only_the_second_track_survives():
    people = identities()
    people.update([(1, SEATED, 0.8)])
    people.update([(1, SEATED, 0.8), (2, SEATED, 0.7)])

    assert ids(people.update([(2, SEATED, 0.7)])) == [1]


def test_forgotten_people_do_not_accumulate():
    people = identities(hold_frames=1)
    for track in range(50):
        people.update([(track, SEATED + [track * 1000, 0, track * 1000, 0], 0.8)])
        people.update([])
        people.update([])

    assert len(people.people) == 0
    assert len(people.owner) == 0


CHAIR_BACK = np.array([870.0, 330.0, 1040.0, 690.0])
PERSON_IN_FRONT = np.array([956.0, 330.0, 1040.0, 526.0])


def test_a_confident_person_is_shown_rather_than_the_faint_box_around_them():
    people = identities()
    people.update([(129, CHAIR_BACK, 0.18)])

    shown = people.update([(129, CHAIR_BACK, 0.18), (130, PERSON_IN_FRONT, 0.80)])

    assert [p.box.tolist() for p in shown] == [PERSON_IN_FRONT.tolist()]


def test_a_faint_box_that_was_once_confident_still_gives_way_to_a_confident_person():
    people = identities()
    people.update([(129, CHAIR_BACK, 0.36)])

    shown = people.update([(129, CHAIR_BACK, 0.18), (130, PERSON_IN_FRONT, 0.80)])

    assert [p.box.tolist() for p in shown] == [PERSON_IN_FRONT.tolist()]


def test_the_floor_point_follows_the_person_not_the_faint_box_that_came_first():
    people = identities()
    people.update([(129, CHAIR_BACK, 0.18)])

    shown = people.update([(129, CHAIR_BACK, 0.18), (130, PERSON_IN_FRONT, 0.80)])

    assert shown[0].ground.tolist() == [998.0, 526.0]


def test_a_person_does_not_make_the_faint_box_around_them_worth_showing_after_they_go():
    people = identities(hold_frames=2)
    people.update([(129, CHAIR_BACK, 0.18)])
    people.update([(129, CHAIR_BACK, 0.18), (130, PERSON_IN_FRONT, 0.80)])

    for _ in range(3):
        last = people.update([(129, CHAIR_BACK, 0.18)])

    assert last == []


def seated_for(people, frames, track=1):
    for _ in range(frames):
        people.update([(track, SEATED, 0.8)])


def test_someone_seated_stays_on_screen_through_a_long_detection_gap():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)

    shown = [people.update([]) for _ in range(6)]

    assert all(ids(s) == [1] for s in shown)
    assert people.update([]) == []


def test_someone_seated_keeps_their_id_when_they_come_back_on_a_new_track():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    for _ in range(5):
        people.update([])

    assert ids(people.update([(9, SEATED, 0.7)])) == [1]


def test_someone_walking_gets_only_the_short_hold():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    for step in range(6):
        people.update([(1, SEATED + [step * 80, 0, step * 80, 0], 0.8)])

    assert ids(people.update([])) == [1]
    assert people.update([]) == []


def test_someone_who_stood_up_and_moved_gets_only_the_short_hold():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    people.update([(1, SEATED + [200, 0, 200, 0], 0.8)])

    assert ids(people.update([])) == [1]
    assert people.update([]) == []


def test_a_box_shape_change_does_not_count_as_getting_up():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    people.update([(1, SEATED + [0, 0, 120, 100], 0.8)])

    people.update([])
    assert ids(people.update([])) == [1]


def test_a_shown_person_says_whether_this_frame_actually_saw_them():
    people = identities()

    assert people.update([(1, SEATED, 0.8)])[0].held is False
    assert people.update([])[0].held is True


def test_a_new_box_that_drifts_onto_someone_held_becomes_them_not_a_second_person():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8)])
    people.update([])
    people.update([(2, SEATED + [90, 0, 90, 0], 0.8)])

    shown = people.update([(2, SEATED + [10, 0, 10, 0], 0.8)])

    assert ids(shown) == [1]
    assert shown[0].held is False


def test_someone_passing_a_held_person_can_still_walk_away_as_their_own_person():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8)])
    people.update([])
    people.update([(2, SEATED, 0.8)])

    assert ids(people.update([(2, NEIGHBOUR, 0.8)])) != []
    assert 2 in ids(people.update([(2, NEIGHBOUR, 0.8)]))


def test_a_held_box_gives_way_to_someone_seen_partly_over_it():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8)])
    people.update([])

    shown = people.update([(2, SEATED + [60, 0, 60, 0], 0.8)])

    assert ids(shown) == [1]
    assert shown[0].held is False


def test_a_held_box_stays_when_someone_is_seen_clear_of_it():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8)])
    people.update([])

    assert ids(people.update([(2, NEIGHBOUR, 0.8)])) == [1, 2]


ANKLE_ON_THE_DESK = np.array([60.0, 900.0], np.float32)


def test_pose_guessing_feet_does_not_move_someone_seated():
    people = identities(settle_frames=3)
    seated_for(people, 4)
    settled_ground = people.people[1].ground.tolist()

    assert people.place_feet(1, ANKLE_ON_THE_DESK).tolist() == settled_ground


def test_feet_are_used_for_someone_on_the_move():
    people = identities(settle_frames=3)
    people.update([(1, SEATED, 0.8)])

    assert people.place_feet(1, ANKLE_ON_THE_DESK).tolist() == ANKLE_ON_THE_DESK.tolist()


def test_guessed_feet_cannot_stop_someone_counting_as_seated():
    people = identities(settle_frames=3)
    for _ in range(4):
        people.update([(1, SEATED, 0.8)])
        people.place_feet(1, ANKLE_ON_THE_DESK)

    assert people.place_feet(1, np.array([1.0, 2.0], np.float32)).tolist() != [1.0, 2.0]


def test_someone_seated_who_gets_a_new_track_keeps_their_place_on_the_floor():
    people = identities(settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    place = people.people[1].ground.tolist()
    people.update([])

    shown = people.update([(2, SEATED + [0, 0, 0, -100], 0.8)])

    assert shown[0].ground.tolist() == place


def ankles_at(x, y):
    ankles = np.zeros((17, 3), np.float32)
    ankles[15] = [x, y, 0.9]
    ankles[16] = [x + 10, y, 0.9]
    return ankles


def test_analytics_uses_the_given_floor_point_over_guessed_ankles():
    analytics = ra.Analytics(ra.Config(), 15.0, (1280, 720))
    given = np.array([640.0, 500.0], np.float32)

    snap = analytics.update([ra.PersonDet(1, SEATED, 0.8, ankles_at(60, 700), ground=given)], [], 0.0)

    assert snap["people"][0].ground.tolist() == given.tolist()


def test_analytics_still_uses_ankles_when_no_floor_point_is_given():
    analytics = ra.Analytics(ra.Config(), 15.0, (1280, 720))

    snap = analytics.update([ra.PersonDet(1, SEATED, 0.8, ankles_at(60, 700))], [], 0.0)

    assert snap["people"][0].ground.tolist() == [65.0, 700.0]


HEAD_ONLY = np.array([110.0, 80.0, 150.0, 125.0])


def test_a_head_sized_box_does_not_replace_someone_held():
    people = identities(settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    people.update([])

    shown = people.update([(2, HEAD_ONLY, 0.8)])

    assert ids(shown) == [1]
    assert shown[0].box.tolist() == SEATED.tolist()


def test_a_head_sized_box_does_not_cost_someone_their_seat_memory():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    people.update([(2, HEAD_ONLY, 0.8)])

    assert all(ids(people.update([])) == [1] for _ in range(5))


def test_a_head_sized_track_on_someone_seen_does_not_shrink_their_box():
    people = identities()
    people.update([(1, SEATED, 0.8)])

    shown = people.update([(2, HEAD_ONLY, 0.9)])

    assert shown[0].box.tolist() == SEATED.tolist()
    assert shown[0].held is True


def test_someone_seated_settles_on_the_lowest_box_bottom_seen():
    people = identities(settle_frames=3, box_follow=1.0, floor_creep_px=1000.0)
    short = np.array([100.0, 100.0, 200.0, 250.0])
    for _ in range(4):
        people.update([(1, short, 0.8)])

    people.update([(1, np.array([100.0, 100.0, 200.0, 400.0]), 0.8)])
    shown = people.update([(1, short, 0.8)])

    assert shown[0].ground.tolist() == [150.0, 400.0]


def test_finding_the_floor_is_a_slow_creep_not_a_jump():
    people = identities(settle_frames=3, box_follow=1.0, floor_creep_px=0.5)
    short = np.array([100.0, 100.0, 200.0, 250.0])
    for _ in range(4):
        people.update([(1, short, 0.8)])
    before = people.people[1].ground[1]

    shown = people.update([(1, np.array([100.0, 100.0, 200.0, 400.0]), 0.8)])

    assert shown[0].ground[1] == before + 0.5


HEADREST = np.array([776.0, 497.0, 822.0, 525.0])
HEADREST_AS_CHAIR = np.array([772.0, 498.0, 822.0, 525.0])
CHAIR_UNDER_SEATED = np.array([95.0, 200.0, 215.0, 470.0])


def test_a_person_box_on_a_chair_box_is_the_chair():
    assert identities().update([(1, HEADREST, 0.5)], [(HEADREST_AS_CHAIR, 0.5)]) == []


def test_a_chair_stays_a_chair_while_the_detector_briefly_misses_it():
    people = identities(chair_memory=2)
    people.update([(1, HEADREST, 0.5)], [(HEADREST_AS_CHAIR, 0.5)])

    assert people.update([(1, HEADREST, 0.5)], []) == []
    assert people.update([(1, HEADREST, 0.5)], []) == []
    assert ids(people.update([(1, HEADREST, 0.5)], [])) == [1]


def test_someone_sitting_in_a_chair_is_still_a_person():
    assert ids(identities().update([(1, SEATED, 0.8)], [(CHAIR_UNDER_SEATED, 0.8)])) == [1]


BEHIND_CHAIR_BACK = np.array([1145.0, 488.0, 1311.0, 640.0])
FAINT_CHAIR_BACK = np.array([1147.0, 490.0, 1305.0, 645.0])


def test_someone_behind_a_chair_back_the_detector_faintly_calls_a_chair_is_still_a_person():
    assert ids(identities().update([(1, BEHIND_CHAIR_BACK, 0.4)], [(FAINT_CHAIR_BACK, 0.12)])) == [1]


def test_someone_already_on_screen_stays_a_person_when_a_chair_box_matches_them():
    people = identities()
    people.update([(1, BEHIND_CHAIR_BACK, 0.4)])

    shown = people.update([(1, BEHIND_CHAIR_BACK, 0.4)], [(FAINT_CHAIR_BACK, 0.3)])

    assert ids(shown) == [1]
    assert shown[0].held is False


def test_a_new_track_on_someone_already_on_screen_is_not_taken_for_a_chair():
    people = identities()
    people.update([(1, BEHIND_CHAIR_BACK, 0.4)])

    shown = people.update([(2, BEHIND_CHAIR_BACK, 0.4)], [(FAINT_CHAIR_BACK, 0.3)])

    assert ids(shown) == [1]
    assert shown[0].held is False

SEATED_AT_DESK = np.array([794.0, 482.0, 1070.0, 795.0])
STANDING_WITH_CHAIR = np.array([524.0, 487.0, 980.0, 1037.0])
PULLED_CHAIR = np.array([611.0, 517.0, 979.0, 1075.0])
SEATED_BEHIND = np.array([598.0, 487.0, 692.0, 618.0])


def test_someone_pulling_their_chair_as_they_stand_does_not_hide_the_person_behind_them():
    people = identities()
    people.update([(3, SEATED_AT_DESK, 0.8), (285, SEATED_BEHIND, 0.45)])
    people.update([(3, STANDING_WITH_CHAIR, 0.8), (285, SEATED_BEHIND, 0.45)])

    shown = people.update([(3, STANDING_WITH_CHAIR, 0.8), (285, SEATED_BEHIND, 0.45)], [(PULLED_CHAIR, 0.33)])

    assert ids(shown) == [3, 285]

WALKING_IN_FRONT = np.array([80.0, -50.0, 240.0, 450.0])


def test_someone_walking_in_front_of_a_seated_person_keeps_their_own_id():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8), (2, NEIGHBOUR, 0.9)])

    shown = people.update([(2, WALKING_IN_FRONT, 0.9)])

    assert {p.id: p.held for p in shown} == {1: True, 2: False}


def test_two_boxes_on_one_person_keep_the_older_id():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8)])
    people.update([(1, SEATED, 0.8), (5, SEATED + [60, 0, 60, 0], 0.8)])

    assert ids(people.update([(1, SEATED, 0.8)])) == [1]


def test_someone_seated_who_leans_keeps_the_long_hold():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    people.update([(1, SEATED + [60, 0, 60, 0], 0.8)])

    assert all(ids(people.update([])) == [1] for _ in range(5))


def test_two_boxes_on_one_person_still_count_once_when_the_second_box_comes_back():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8)])
    people.update([(1, SEATED, 0.8), (5, SEATED + [60, 0, 60, 0], 0.8)])
    people.update([(1, SEATED, 0.8)])

    assert len(people.update([(1, SEATED, 0.8), (5, SEATED + [60, 0, 60, 0], 0.8)])) == 1


STANDING_UP = np.array([100.0, -150.0, 200.0, 450.0])


def test_someone_who_stands_up_and_walks_off_gets_only_the_short_hold():
    people = identities(hold_frames=1, settle_frames=3, seat_hold_frames=6)
    seated_for(people, 4)
    people.update([(1, STANDING_UP, 0.8)])
    people.update([(1, STANDING_UP + [200, 0, 200, 0], 0.8)])

    assert ids(people.update([])) == [1]
    assert people.update([]) == []


MAN_AT_DESK = np.array([795.0, 498.0, 931.0, 788.0])


def test_a_headrest_merged_into_someone_does_not_come_back_as_a_person():
    people = identities()
    people.update([(89, MAN_AT_DESK, 0.7)])
    people.update([(89, MAN_AT_DESK, 0.7), (385, HEADREST, 0.5)])
    people.update([(89, MAN_AT_DESK, 0.7)])

    assert len(people.update([(89, MAN_AT_DESK, 0.7), (385, HEADREST, 0.5)], [(HEADREST_AS_CHAIR, 0.5)])) == 1


def test_a_held_box_gives_way_to_someone_else_now_in_that_spot():
    people = identities(hold_frames=5)
    people.update([(1, SEATED, 0.8), (2, NEIGHBOUR, 0.9)])

    shown = people.update([(2, SEATED + [10, 0, 10, 0], 0.9)])

    assert ids(shown) == [2]
    assert shown[0].held is False

