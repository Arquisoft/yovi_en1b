use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use gamey::{YBotRegistry, YEN, create_default_state, create_router, state::AppState, RandomBot, MoveResponse, ErrorResponse};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;

/// Helper to create a test app with the default state
fn test_app() -> axum::Router {
    create_router(create_default_state())
}

/// Helper to create a test app with a custom state
fn test_app_with_state(state: AppState) -> axum::Router {
    create_router(state)
}

// ============================================================================
// Status endpoint tests
// ============================================================================

#[tokio::test]
async fn test_status_endpoint_returns_ok() {
    let app = test_app();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(&body[..], b"OK");
}

// ============================================================================
// Choose endpoint tests - Success cases
// ============================================================================

#[tokio::test]
async fn test_choose_endpoint_with_valid_request() {
    let app = test_app();

    // Create a valid YEN (Y-game Exchange Notation) for a size 3 board
    // Layout: empty board with 3 rows (size 3): row1=1cell, row2=2cells, row3=3cells
    let yen = YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ybot/choose/random_bot")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&yen).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let move_response: MoveResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(move_response.api_version, "v1");
    assert_eq!(move_response.bot_id, "random_bot");
    // Coordinates should be valid (we can't predict exactly which one the random bot picks)
}

#[tokio::test]
async fn test_choose_endpoint_with_partially_filled_board() {
    let app = test_app();

    // Board with some cells already filled: B in first cell, R in second
    let yen = YEN::new(3, 2, vec!['B', 'R'], "B/R./.B.".to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ybot/choose/random_bot")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&yen).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let move_response: MoveResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(move_response.api_version, "v1");
    assert_eq!(move_response.bot_id, "random_bot");
}

// ============================================================================
// Choose endpoint tests - Error cases
// ============================================================================

#[tokio::test]
async fn test_choose_endpoint_with_invalid_api_version() {
    let app = test_app();

    let yen = YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v2/ybot/choose/random_bot") // v2 is not supported
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&yen).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK); // Axum returns 200 with error JSON

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let error_response: ErrorResponse = serde_json::from_slice(&body).unwrap();

    assert!(error_response.message.contains("Unsupported API version"));
    assert_eq!(error_response.api_version, Some("v2".to_string()));
}

#[tokio::test]
async fn test_choose_endpoint_with_unknown_bot() {
    let app = test_app();

    let yen = YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ybot/choose/unknown_bot")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&yen).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let error_response: ErrorResponse = serde_json::from_slice(&body).unwrap();

    assert!(error_response.message.contains("Bot not found"));
    assert!(error_response.message.contains("unknown_bot"));
    assert_eq!(error_response.bot_id, Some("unknown_bot".to_string()));
}

#[tokio::test]
async fn test_choose_endpoint_with_invalid_json() {
    let app = test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ybot/choose/random_bot")
                .header("content-type", "application/json")
                .body(Body::from("{ invalid json }"))
                .unwrap(),
        )
        .await
        .unwrap();

    // Invalid JSON should return a 4xx error
    assert!(response.status().is_client_error());
}

#[tokio::test]
async fn test_choose_endpoint_with_missing_content_type() {
    let app = test_app();

    let yen = YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ybot/choose/random_bot")
                // No content-type header
                .body(Body::from(serde_json::to_string(&yen).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Missing content-type should return an error
    assert!(response.status().is_client_error());
}

// ============================================================================
// Custom state tests
// ============================================================================

#[tokio::test]
async fn test_choose_with_custom_bot_registry() {
    // Create a custom registry with only the random bot
    let bots = YBotRegistry::new().with_bot(Arc::new(RandomBot));
    let state = AppState::new(bots);
    let app = test_app_with_state(state);

    let yen = YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ybot/choose/random_bot")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&yen).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_choose_with_empty_bot_registry() {
    // Create an empty registry
    let bots = YBotRegistry::new();
    let state = AppState::new(bots);
    let app = test_app_with_state(state);

    let yen = YEN::new(3, 0, vec!['B', 'R'], "./../...".to_string());

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/ybot/choose/random_bot")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&yen).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body().collect().await.unwrap().to_bytes();
    let error_response: ErrorResponse = serde_json::from_slice(&body).unwrap();

    assert!(error_response.message.contains("Bot not found"));
}

// ============================================================================
// Route not found tests
// ============================================================================

#[tokio::test]
async fn test_unknown_route_returns_404() {
    let app = test_app();

    let response = app
        .oneshot(
            Request::builder()
                .uri("/unknown/route")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_wrong_method_on_status_endpoint() {
    let app = test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // POST to a GET-only endpoint should return 405 Method Not Allowed
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn test_get_on_choose_endpoint_returns_method_not_allowed() {
    let app = test_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/ybot/choose/random_bot")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
}

// ============================================================================
// Issue #234 — MCTS bot invalid move regression tests
// ============================================================================

/// Build a YEN JSON body string ready to POST to /v1/ybot/choose/{bot_id}.
fn yen_body(size: u32, turn: u32, layout: &str) -> String {
    let yen = YEN::new(size, turn, vec!['B', 'R'], layout.to_string());
    serde_json::to_string(&yen).unwrap()
}

/// Helper: call /v1/ybot/choose/{bot_id} and assert a valid move is returned.
async fn assert_valid_move(bot_id: &str, size: u32, turn: u32, layout: &str) {
    let app = test_app();
    let body = yen_body(size, turn, layout);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/v1/ybot/choose/{}", bot_id))
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "bot={} size={} layout={} — expected 200",
        bot_id, size, layout
    );

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let move_resp: MoveResponse = serde_json::from_slice(&bytes)
        .expect("Response should deserialize to MoveResponse");

    // The returned coordinate must be valid on this board.
    let coords = move_resp.coords;
    let sum = coords.x() + coords.y() + coords.z();
    assert_eq!(
        sum,
        size - 1,
        "Coordinate {:?} is invalid for board size {} (x+y+z must equal {})",
        coords, size, size - 1
    );
}

/// MCTS on the exact position from issue #234: nearly-full size-3 board.
#[tokio::test]
async fn test_mcts_issue234_nearly_full_board() {
    // "B/RB/R.." — 4 pieces placed, 2 empty (indices 0 and 2), Blue to move.
    assert_valid_move("hard", 3, 0, "B/RB/R..").await;
}

/// MCTS on an empty board — should always return a move.
#[tokio::test]
async fn test_mcts_empty_board_size3() {
    assert_valid_move("hard", 3, 0, "./../...").await;
}

/// MCTS on an empty board — larger size.
#[tokio::test]
async fn test_mcts_empty_board_size5() {
    assert_valid_move("hard", 5, 0, "./../.././../..../.....").await;
}

/// MCTS when only one move is left — must not panic or return None.
#[tokio::test]
async fn test_mcts_one_move_left() {
    // Size-2 board has 3 cells: (2,0,0), (1,0,1), (1,1,0)
    // Fill two of them; one empty cell remains.
    // Layout "B/R." — Blue@(2,0,0), Red@(1,0,1), empty@(1,1,0)
    assert_valid_move("hard", 2, 0, "B/R.").await;
}

/// MCTS when it's Red's (player 1) turn.
#[tokio::test]
async fn test_mcts_red_turn() {
    // turn=1 means Red to move; "B/R." board, one empty cell.
    assert_valid_move("hard", 2, 1, "B/R.").await;
}

/// Concurrent requests with the same position must all succeed (issue #234).
/// Ten simultaneous requests to the MCTS endpoint should all return valid moves
/// without any of them failing or panicking.
#[tokio::test]
async fn test_mcts_concurrent_requests_same_position() {
    use std::sync::Arc;
    use tower::Service;

    let app = Arc::new(std::sync::Mutex::new(test_app()));
    let layout = "B/RB/R..";
    let body = yen_body(3, 0, layout);

    let mut handles = Vec::new();
    for _ in 0..10 {
        let body_clone = body.clone();
        handles.push(tokio::spawn(async move {
            let local_app = test_app(); // each task gets its own router instance
            let response = local_app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/v1/ybot/choose/hard")
                        .header("content-type", "application/json")
                        .body(Body::from(body_clone))
                        .unwrap(),
                )
                .await
                .unwrap();
            response.status()
        }));
    }

    for handle in handles {
        let status = handle.await.unwrap();
        assert_eq!(status, StatusCode::OK, "Concurrent MCTS request failed");
    }
}

/// /play endpoint with the issue #234 position and mcts strategy must succeed.
#[tokio::test]
async fn test_play_endpoint_mcts_issue234_position() {
    use gamey::game_server::dto::PlayResponse;

    let app = test_app();
    let req_body = serde_json::json!({
        "yen_state": "B/RB/R..",
        "strategy": "mcts",
        "board_size": 3
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/play")
                .header("content-type", "application/json")
                .body(Body::from(req_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "/play with mcts strategy on issue #234 position should succeed"
    );

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let play_resp: PlayResponse = serde_json::from_slice(&bytes)
        .expect("Should deserialize to PlayResponse");

    // The returned coordinate must be valid.
    let coords = play_resp.coordinates;
    assert_eq!(
        coords.x() + coords.y() + coords.z(),
        2, // board_size - 1 = 3 - 1 = 2
        "Bot coordinate {:?} is invalid for board size 3",
        coords
    );
}
