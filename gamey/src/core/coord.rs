use std::fmt::Display;

use serde::{Deserialize, Serialize};

/// The three sides of the triangular board.
///
/// Each side corresponds to one barycentric component being zero:
/// - A → `x = 0` (bottom edge)
/// - B → `y = 0` (left edge)
/// - C → `z = 0` (right edge)
///
/// Corners sit at the intersection of two sides, e.g. `(0, 0, z)` is on both A and B.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BoardSide {
    /// Bottom edge (`x = 0`).
    A,
    /// Left edge (`y = 0`).
    B,
    /// Right edge (`z = 0`).
    C,
}

impl Display for BoardSide {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BoardSide::A => write!(f, "A"),
            BoardSide::B => write!(f, "B"),
            BoardSide::C => write!(f, "C"),
        }
    }
}

/// Represents barycentric coordinates (x, y, z) on a triangular board.
///
/// In a triangular board of size N, valid coordinates satisfy:
/// - x + y + z = N - 1
/// - x, y, z >= 0
///
/// Each coordinate component indicates the distance from one of the three sides:
/// - x = 0 means the cell touches side A
/// - y = 0 means the cell touches side B
/// - z = 0 means the cell touches side C
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Coordinates {
    x: u32,
    y: u32,
    z: u32,
}

impl Coordinates {
    /// Creates new coordinates with the given x, y, z values.
    pub fn new(x: u32, y: u32, z: u32) -> Self {
        Self { x, y, z }
    }

    /// Returns the x coordinate (distance from side A).
    pub fn x(&self) -> u32 {
        self.x
    }

    /// Returns the y coordinate (distance from side B).
    pub fn y(&self) -> u32 {
        self.y
    }

    /// Returns the z coordinate (distance from side C).
    pub fn z(&self) -> u32 {
        self.z
    }

    /// Total hex count for a triangular board: `n * (n + 1) / 2`.
    ///
    /// ```
    /// use gamey::Coordinates;
    /// assert_eq!(Coordinates::total_cells(1), 1);
    /// assert_eq!(Coordinates::total_cells(3), 6);
    /// assert_eq!(Coordinates::total_cells(5), 15);
    /// ```
    pub fn total_cells(board_size: u32) -> u32 {
        (board_size * (board_size + 1)) / 2
    }

    /// Checks whether these coordinates lie on a board of the given size.
    /// Just verifies `x + y + z == board_size - 1`.
    ///
    /// ```
    /// use gamey::Coordinates;
    /// assert!(Coordinates::new(1, 2, 1).is_valid(5));
    /// assert!(!Coordinates::new(1, 2, 3).is_valid(5));
    /// ```
    pub fn is_valid(&self, board_size: u32) -> bool {
        board_size >= 1 && self.x + self.y + self.z == board_size - 1
    }

    /// The up-to-6 adjacent hex cells. Boundary cells get fewer (2 for corners, 4 for edges).
    ///
    /// ```
    /// use gamey::Coordinates;
    /// assert_eq!(Coordinates::new(2, 1, 1).neighbors(5).len(), 6); // interior
    /// assert_eq!(Coordinates::new(4, 0, 0).neighbors(5).len(), 2); // corner
    /// ```
    pub fn neighbors(&self, _board_size: u32) -> Vec<Coordinates> {
        let mut neighbors = Vec::with_capacity(6);
        let x = self.x;
        let y = self.y;
        let z = self.z;

        // +1 on one component, -1 on another keeps the sum constant.
        // We just need to guard against underflow on the decremented component.
        if x > 0 {
            neighbors.push(Coordinates::new(x - 1, y + 1, z));
            neighbors.push(Coordinates::new(x - 1, y, z + 1));
        }
        if y > 0 {
            neighbors.push(Coordinates::new(x + 1, y - 1, z));
            neighbors.push(Coordinates::new(x, y - 1, z + 1));
        }
        if z > 0 {
            neighbors.push(Coordinates::new(x + 1, y, z - 1));
            neighbors.push(Coordinates::new(x, y + 1, z - 1));
        }
        neighbors
    }

    /// Converts a linear index to barycentric coordinates (x, y, z).
    ///
    /// The index follows row-major order starting from the top of the triangle.
    /// For a board of size N, indices go from 0 to N*(N+1)/2 - 1.
    pub fn from_index(index: u32, board_size: u32) -> Self {
        // As i = (r * (r + 1)) / 2
        // r = floor((sqrt(8*i + 1) - 1) / 2)
        let i_f = index as f64;
        let r = (((8.0 * i_f + 1.0).sqrt() - 1.0) / 2.0).floor() as u32;

        let row_start_index = (r * (r + 1)) / 2;
        let c = index - row_start_index;

        let x = board_size - 1 - r;
        let y = c;
        let z = (board_size - 1) - x - y;

        Coordinates::new(x, y, z)
    }

    /// Converts these coordinates to a linear index.
    ///
    /// This is the inverse of `from_index`.
    pub fn to_index(&self, board_size: u32) -> u32 {
        let r = (board_size - 1) - self.x;
        let row_start_index = (r * (r + 1)) / 2;
        let c = self.y;
        row_start_index + c
    }

    /// Creates coordinates from a slice of 3 u32 values.
    ///
    /// Returns `None` if the slice does not have exactly 3 elements.
    pub fn from_vec(coords: &[u32]) -> Option<Self> {
        if coords.len() != 3 {
            return None;
        }
        Some(Self {
            x: coords[0],
            y: coords[1],
            z: coords[2],
        })
    }

    /// Returns true if this cell touches side A (x == 0).
    pub fn touches_side_a(&self) -> bool {
        self.x == 0
    }

    /// Returns true if this cell touches side B (y == 0).
    pub fn touches_side_b(&self) -> bool {
        self.y == 0
    }

    /// Returns true if this cell touches side C (z == 0).
    pub fn touches_side_c(&self) -> bool {
        self.z == 0
    }

    /// Which sides of the board this cell sits on.
    /// Interior → empty, edge → 1 side, corner → 2 sides.
    ///
    /// ```
    /// use gamey::{Coordinates, BoardSide};
    /// let corner = Coordinates::new(0, 0, 4);
    /// assert_eq!(corner.sides().len(), 2);
    /// ```
    pub fn sides(&self) -> Vec<BoardSide> {
        let mut sides = Vec::with_capacity(2);
        if self.touches_side_a() {
            sides.push(BoardSide::A);
        }
        if self.touches_side_b() {
            sides.push(BoardSide::B);
        }
        if self.touches_side_c() {
            sides.push(BoardSide::C);
        }
        sides
    }
}

impl From<Coordinates> for Vec<u32> {
    fn from(coords: Coordinates) -> Self {
        vec![coords.x, coords.y, coords.z]
    }
}

impl Display for Coordinates {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "({}, {}, {})", self.x, self.y, self.z)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::collections::HashSet;

    // ========================================================================
    // Basic construction and accessors
    // ========================================================================

    #[test]
    fn test_new_coordinates() {
        let coords = Coordinates::new(1, 2, 3);
        assert_eq!(coords.x(), 1);
        assert_eq!(coords.y(), 2);
        assert_eq!(coords.z(), 3);
    }

    #[test]
    fn test_from_vec_valid() {
        let coords = Coordinates::from_vec(&[1, 2, 3]);
        assert!(coords.is_some());
        let coords = coords.unwrap();
        assert_eq!(coords.x(), 1);
        assert_eq!(coords.y(), 2);
        assert_eq!(coords.z(), 3);
    }

    #[test]
    fn test_from_vec_invalid_length() {
        assert!(Coordinates::from_vec(&[1, 2]).is_none());
        assert!(Coordinates::from_vec(&[1, 2, 3, 4]).is_none());
        assert!(Coordinates::from_vec(&[]).is_none());
    }

    #[test]
    fn test_into_vec() {
        let coords = Coordinates::new(1, 2, 3);
        let vec: Vec<u32> = coords.into();
        assert_eq!(vec, vec![1, 2, 3]);
    }

    #[test]
    fn test_display() {
        let coords = Coordinates::new(1, 2, 3);
        assert_eq!(format!("{}", coords), "(1, 2, 3)");
    }

    // ========================================================================
    // total_cells
    // ========================================================================

    #[test]
    fn test_total_cells() {
        assert_eq!(Coordinates::total_cells(1), 1);
        assert_eq!(Coordinates::total_cells(2), 3);
        assert_eq!(Coordinates::total_cells(3), 6);
        assert_eq!(Coordinates::total_cells(5), 15);
        assert_eq!(Coordinates::total_cells(7), 28);
        assert_eq!(Coordinates::total_cells(10), 55);
    }

    // ========================================================================
    // is_valid
    // ========================================================================

    #[test]
    fn test_is_valid_true() {
        // On a size-5 board, x + y + z must equal 4
        assert!(Coordinates::new(2, 1, 1).is_valid(5));
        assert!(Coordinates::new(0, 0, 4).is_valid(5));
        assert!(Coordinates::new(4, 0, 0).is_valid(5));
        assert!(Coordinates::new(0, 4, 0).is_valid(5));
        assert!(Coordinates::new(1, 1, 2).is_valid(5));
    }

    #[test]
    fn test_is_valid_false() {
        // Sum doesn't match board_size - 1
        assert!(!Coordinates::new(1, 2, 3).is_valid(5)); // sum=6, need 4
        assert!(!Coordinates::new(0, 0, 0).is_valid(5)); // sum=0, need 4
        assert!(!Coordinates::new(5, 0, 0).is_valid(5)); // sum=5, need 4
    }

    #[test]
    fn test_is_valid_size_1() {
        assert!(Coordinates::new(0, 0, 0).is_valid(1));
        assert!(!Coordinates::new(1, 0, 0).is_valid(1));
    }

    // ========================================================================
    // Index round-trip
    // ========================================================================

    #[test]
    fn test_coordinates_conversion() {
        let coords = Coordinates::new(1, 2, 3);
        let index = coords.to_index(7);
        let converted = Coordinates::from_index(index, 7);
        assert_eq!(coords, converted);
    }

    #[test]
    fn test_index_roundtrip_all_cells() {
        let board_size = 5;
        let total_cells = Coordinates::total_cells(board_size);
        for idx in 0..total_cells {
            let coords = Coordinates::from_index(idx, board_size);
            let back = coords.to_index(board_size);
            assert_eq!(idx, back, "Index {} did not roundtrip correctly", idx);
        }
    }

    // ========================================================================
    // Side touching
    // ========================================================================

    #[test]
    fn test_coordinates_sides() {
        let coords_a = Coordinates::new(0, 2, 2);
        let coords_b = Coordinates::new(2, 0, 2);
        let coords_c = Coordinates::new(2, 2, 0);
        assert!(coords_a.touches_side_a());
        assert!(coords_b.touches_side_b());
        assert!(coords_c.touches_side_c());
    }

    #[test]
    fn test_corner_touches_two_sides() {
        // Top corner touches sides B and C (y=0 and z=0)
        let top = Coordinates::new(4, 0, 0);
        assert!(!top.touches_side_a());
        assert!(top.touches_side_b());
        assert!(top.touches_side_c());
    }

    #[test]
    fn test_interior_cell_touches_no_sides() {
        let interior = Coordinates::new(1, 1, 1);
        assert!(!interior.touches_side_a());
        assert!(!interior.touches_side_b());
        assert!(!interior.touches_side_c());
    }

    // ========================================================================
    // BoardSide enum and sides() method
    // ========================================================================

    #[test]
    fn test_board_side_display() {
        assert_eq!(format!("{}", BoardSide::A), "A");
        assert_eq!(format!("{}", BoardSide::B), "B");
        assert_eq!(format!("{}", BoardSide::C), "C");
    }

    #[test]
    fn test_sides_interior() {
        let interior = Coordinates::new(1, 1, 1);
        assert!(interior.sides().is_empty());
    }

    #[test]
    fn test_sides_edge() {
        let edge_a = Coordinates::new(0, 2, 2);
        assert_eq!(edge_a.sides(), vec![BoardSide::A]);

        let edge_b = Coordinates::new(2, 0, 2);
        assert_eq!(edge_b.sides(), vec![BoardSide::B]);

        let edge_c = Coordinates::new(2, 2, 0);
        assert_eq!(edge_c.sides(), vec![BoardSide::C]);
    }

    #[test]
    fn test_sides_corner_ab() {
        let corner = Coordinates::new(0, 0, 4);
        let sides = corner.sides();
        assert_eq!(sides.len(), 2);
        assert!(sides.contains(&BoardSide::A));
        assert!(sides.contains(&BoardSide::B));
    }

    #[test]
    fn test_sides_corner_ac() {
        let corner = Coordinates::new(0, 4, 0);
        let sides = corner.sides();
        assert_eq!(sides.len(), 2);
        assert!(sides.contains(&BoardSide::A));
        assert!(sides.contains(&BoardSide::C));
    }

    #[test]
    fn test_sides_corner_bc() {
        let corner = Coordinates::new(4, 0, 0);
        let sides = corner.sides();
        assert_eq!(sides.len(), 2);
        assert!(sides.contains(&BoardSide::B));
        assert!(sides.contains(&BoardSide::C));
    }

    // ========================================================================
    // neighbors() method
    // ========================================================================

    fn assert_neighbors_match(actual: Vec<Coordinates>, expected: Vec<Coordinates>) {
        let actual_set: HashSet<_> = actual.into_iter().collect();
        let expected_set: HashSet<_> = expected.into_iter().collect();
        assert_eq!(actual_set, expected_set);
    }

    #[test]
    fn test_neighbors_interior_has_six() {
        let cell = Coordinates::new(2, 1, 1);
        let neighbors = cell.neighbors(5);

        let expected = vec![
            Coordinates::new(1, 2, 1),
            Coordinates::new(1, 1, 2),
            Coordinates::new(3, 0, 1),
            Coordinates::new(2, 0, 2),
            Coordinates::new(3, 1, 0),
            Coordinates::new(2, 2, 0),
        ];

        assert_eq!(neighbors.len(), 6);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_neighbors_corner_has_two() {
        let top_corner = Coordinates::new(4, 0, 0);
        let neighbors = top_corner.neighbors(5);

        let expected = vec![
            Coordinates::new(3, 1, 0),
            Coordinates::new(3, 0, 1),
        ];

        assert_eq!(neighbors.len(), 2);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_neighbors_edge_has_four() {
        let edge_cell = Coordinates::new(0, 2, 2);
        let neighbors = edge_cell.neighbors(5);

        let expected = vec![
            Coordinates::new(1, 1, 2),
            Coordinates::new(0, 1, 3),
            Coordinates::new(1, 2, 1),
            Coordinates::new(0, 3, 1),
        ];

        assert_eq!(neighbors.len(), 4);
        assert_neighbors_match(neighbors, expected);
    }

    #[test]
    fn test_neighbors_all_valid() {
        // For every cell in a size-5 board, every neighbor must also be valid
        let board_size = 5;
        let total = Coordinates::total_cells(board_size);
        for idx in 0..total {
            let coords = Coordinates::from_index(idx, board_size);
            for neighbor in coords.neighbors(board_size) {
                assert!(
                    neighbor.is_valid(board_size),
                    "Neighbor {:?} of {:?} is not valid for board_size {}",
                    neighbor,
                    coords,
                    board_size
                );
            }
        }
    }

    #[test]
    fn test_neighbors_symmetry() {
        // If B is a neighbor of A, then A must be a neighbor of B
        let board_size = 5;
        let total = Coordinates::total_cells(board_size);
        for idx in 0..total {
            let a = Coordinates::from_index(idx, board_size);
            for b in a.neighbors(board_size) {
                assert!(
                    b.neighbors(board_size).contains(&a),
                    "{:?} is a neighbor of {:?}, but not vice versa",
                    b,
                    a
                );
            }
        }
    }

    // ========================================================================
    // Property-based tests using proptest
    // ========================================================================

    proptest! {
        /// Property: Converting an index to coordinates and back yields the same index.
        #[test]
        fn prop_index_to_coords_roundtrip(board_size in 1u32..=20, idx_factor in 0.0f64..1.0) {
            let total_cells = Coordinates::total_cells(board_size);
            let idx = ((idx_factor * total_cells as f64) as u32).min(total_cells - 1);
            let coords = Coordinates::from_index(idx, board_size);
            let back = coords.to_index(board_size);
            prop_assert_eq!(idx, back, "Index {} did not roundtrip for board_size {}", idx, board_size);
        }

        /// Property: Coordinates from an index always satisfy x + y + z = board_size - 1.
        #[test]
        fn prop_coords_sum_invariant(board_size in 1u32..=20, idx_factor in 0.0f64..1.0) {
            let total_cells = Coordinates::total_cells(board_size);
            let idx = ((idx_factor * total_cells as f64) as u32).min(total_cells - 1);
            let coords = Coordinates::from_index(idx, board_size);
            let sum = coords.x() + coords.y() + coords.z();
            prop_assert_eq!(sum, board_size - 1,
                "Sum {} != {} for coords {:?} from index {} on board_size {}",
                sum, board_size - 1, coords, idx, board_size);
        }

        /// Property: For valid coordinates, converting to index and back yields the same coordinates.
        #[test]
        fn prop_coords_to_index_roundtrip(board_size in 2u32..=20, x_ratio in 0.0f64..1.0, y_ratio in 0.0f64..1.0) {
            // Generate valid coordinates where x + y + z = board_size - 1
            let n = board_size - 1;
            let x = (x_ratio * n as f64) as u32;
            let remaining = n - x;
            let y = (y_ratio * remaining as f64) as u32;
            let z = remaining - y;

            let coords = Coordinates::new(x, y, z);
            let idx = coords.to_index(board_size);
            let back = Coordinates::from_index(idx, board_size);
            prop_assert_eq!(coords, back,
                "Coords {:?} did not roundtrip for board_size {}", coords, board_size);
        }

        /// Property: All coordinate components are non-negative (ensured by u32).
        /// This test verifies the generated index is always within valid bounds.
        #[test]
        fn prop_index_within_bounds(board_size in 1u32..=20, idx_factor in 0.0f64..1.0) {
            let total_cells = Coordinates::total_cells(board_size);
            let idx = ((idx_factor * total_cells as f64) as u32).min(total_cells - 1);
            let coords = Coordinates::from_index(idx, board_size);
            let back_idx = coords.to_index(board_size);
            prop_assert!(back_idx < total_cells,
                "Index {} out of bounds (max {}) for board_size {}", back_idx, total_cells - 1, board_size);
        }

        /// Property: Coordinates generated from any valid index are always valid.
        #[test]
        fn prop_from_index_always_valid(board_size in 1u32..=20, idx_factor in 0.0f64..1.0) {
            let total_cells = Coordinates::total_cells(board_size);
            let idx = ((idx_factor * total_cells as f64) as u32).min(total_cells - 1);
            let coords = Coordinates::from_index(idx, board_size);
            prop_assert!(coords.is_valid(board_size),
                "Coords {:?} from index {} not valid for board_size {}", coords, idx, board_size);
        }

        /// Property: Every neighbor of a valid coordinate is also valid.
        #[test]
        fn prop_neighbors_always_valid(board_size in 2u32..=15, idx_factor in 0.0f64..1.0) {
            let total_cells = Coordinates::total_cells(board_size);
            let idx = ((idx_factor * total_cells as f64) as u32).min(total_cells - 1);
            let coords = Coordinates::from_index(idx, board_size);
            for neighbor in coords.neighbors(board_size) {
                prop_assert!(neighbor.is_valid(board_size),
                    "Neighbor {:?} of {:?} not valid for board_size {}", neighbor, coords, board_size);
            }
        }
    }
}
