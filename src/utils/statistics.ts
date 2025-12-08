/**
 * Statistics Utilities
 *
 * Core statistical functions for risk analysis including:
 * - Descriptive statistics (mean, variance, standard deviation)
 * - Covariance and correlation calculations
 * - Matrix operations for portfolio analysis
 * - Percentile calculations for VaR
 */

/**
 * Statistics class providing mathematical functions for risk calculations
 */
export class Statistics {
  /**
   * Calculate the arithmetic mean of an array
   *
   * @param arr - Array of numbers
   * @returns The mean value
   * @throws Error if array is empty
   */
  mean(arr: number[]): number {
    if (arr.length === 0) {
      throw new Error('Cannot calculate mean of empty array');
    }
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Calculate the sample variance of an array
   * Uses Bessel's correction (n-1 denominator) for unbiased estimation
   *
   * @param arr - Array of numbers
   * @returns The sample variance
   * @throws Error if array has fewer than 2 elements
   */
  variance(arr: number[]): number {
    if (arr.length < 2) {
      throw new Error('Cannot calculate variance with fewer than 2 elements');
    }
    const m = this.mean(arr);
    const squaredDiffs = arr.map((x) => (x - m) ** 2);
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / (arr.length - 1);
  }

  /**
   * Calculate the sample standard deviation
   *
   * @param arr - Array of numbers
   * @returns The sample standard deviation
   */
  stdDev(arr: number[]): number {
    return Math.sqrt(this.variance(arr));
  }

  /**
   * Calculate the sample covariance between two arrays
   *
   * Covariance measures how two variables move together:
   * - Positive: variables tend to move in the same direction
   * - Negative: variables tend to move in opposite directions
   * - Zero: no linear relationship
   *
   * @param arr1 - First array of numbers
   * @param arr2 - Second array of numbers
   * @returns The sample covariance
   * @throws Error if arrays have different lengths or fewer than 2 elements
   */
  covariance(arr1: number[], arr2: number[]): number {
    if (arr1.length !== arr2.length) {
      throw new Error('Arrays must have the same length for covariance calculation');
    }
    if (arr1.length < 2) {
      throw new Error('Cannot calculate covariance with fewer than 2 elements');
    }

    const n = arr1.length;
    const mean1 = this.mean(arr1);
    const mean2 = this.mean(arr2);

    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += (arr1[i] - mean1) * (arr2[i] - mean2);
    }

    return sum / (n - 1);
  }

  /**
   * Calculate the Pearson correlation coefficient between two arrays
   *
   * Correlation is normalized covariance, ranging from -1 to 1:
   * - 1: Perfect positive correlation
   * - 0: No linear correlation
   * - -1: Perfect negative correlation
   *
   * @param arr1 - First array of numbers
   * @param arr2 - Second array of numbers
   * @returns The correlation coefficient
   */
  correlation(arr1: number[], arr2: number[]): number {
    const cov = this.covariance(arr1, arr2);
    const std1 = this.stdDev(arr1);
    const std2 = this.stdDev(arr2);

    if (std1 === 0 || std2 === 0) {
      return 0; // No correlation if either has zero variance
    }

    return cov / (std1 * std2);
  }

  /**
   * Calculate the covariance matrix for multiple arrays
   *
   * The covariance matrix is symmetric, with variances on the diagonal
   * and covariances on the off-diagonal elements.
   *
   * @param arrays - Array of return series (each inner array is one asset's returns)
   * @returns n x n covariance matrix
   */
  covarianceMatrix(arrays: number[][]): number[][] {
    const n = arrays.length;
    const matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const cov = this.covariance(arrays[i], arrays[j]);
        matrix[i][j] = cov;
        matrix[j][i] = cov; // Symmetric
      }
    }

    return matrix;
  }

  /**
   * Calculate the correlation matrix for multiple arrays
   *
   * The correlation matrix has 1s on the diagonal and correlation
   * coefficients on the off-diagonal elements.
   *
   * @param arrays - Array of return series
   * @returns n x n correlation matrix
   */
  correlationMatrix(arrays: number[][]): number[][] {
    const n = arrays.length;
    const matrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1; // Diagonal is always 1
        } else {
          const corr = this.correlation(arrays[i], arrays[j]);
          matrix[i][j] = corr;
          matrix[j][i] = corr; // Symmetric
        }
      }
    }

    return matrix;
  }

  /**
   * Calculate the percentile of a sorted array
   *
   * Uses linear interpolation between data points.
   * This is the foundation for VaR calculation:
   * - 1st percentile = 99% VaR
   * - 5th percentile = 95% VaR
   *
   * @param sortedArr - Array sorted in ascending order
   * @param p - Percentile (0-100)
   * @returns The value at the given percentile
   * @throws Error if percentile is out of range or array is empty
   */
  percentile(sortedArr: number[], p: number): number {
    if (sortedArr.length === 0) {
      throw new Error('Cannot calculate percentile of empty array');
    }
    if (p < 0 || p > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }

    // Handle edge cases
    if (p === 0) return sortedArr[0];
    if (p === 100) return sortedArr[sortedArr.length - 1];

    // Calculate index using linear interpolation
    const index = (p / 100) * (sortedArr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedArr[lower];
    }

    // Linear interpolation
    const weight = index - lower;
    return sortedArr[lower] * (1 - weight) + sortedArr[upper] * weight;
  }

  /**
   * Calculate the dot product of two vectors
   *
   * Used for calculating portfolio return: weights . returns
   *
   * @param arr1 - First vector
   * @param arr2 - Second vector
   * @returns The dot product (scalar)
   * @throws Error if vectors have different lengths
   */
  dotProduct(arr1: number[], arr2: number[]): number {
    if (arr1.length !== arr2.length) {
      throw new Error('Vectors must have the same length for dot product');
    }
    return arr1.reduce((sum, val, i) => sum + val * arr2[i], 0);
  }

  /**
   * Calculate the quadratic form: v^T * M * v
   *
   * Used for calculating portfolio variance: weights^T * covMatrix * weights
   *
   * @param vec - Vector (e.g., portfolio weights)
   * @param matrix - Square matrix (e.g., covariance matrix)
   * @returns The quadratic form result (scalar)
   * @throws Error if dimensions don't match
   */
  quadraticForm(vec: number[], matrix: number[][]): number {
    const n = vec.length;
    if (matrix.length !== n || matrix.some((row) => row.length !== n)) {
      throw new Error('Vector and matrix dimensions must match');
    }

    let result = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result += vec[i] * matrix[i][j] * vec[j];
      }
    }

    return result;
  }

  /**
   * Calculate the average correlation of one asset with multiple others
   *
   * Useful for determining if an asset provides diversification benefit.
   *
   * @param target - Returns of the target asset
   * @param others - Array of return series for other assets
   * @returns Average correlation with other assets
   */
  averageCorrelation(target: number[], others: number[][]): number {
    if (others.length === 0) {
      return 0;
    }

    const correlations = others.map((other) => this.correlation(target, other));
    return this.mean(correlations);
  }

  /**
   * Sum an array of numbers
   *
   * @param arr - Array of numbers
   * @returns The sum
   */
  sum(arr: number[]): number {
    return arr.reduce((total, val) => total + val, 0);
  }

  /**
   * Find the minimum value in an array
   *
   * @param arr - Array of numbers
   * @returns The minimum value
   * @throws Error if array is empty
   */
  min(arr: number[]): number {
    if (arr.length === 0) {
      throw new Error('Cannot find min of empty array');
    }
    return Math.min(...arr);
  }

  /**
   * Find the maximum value in an array
   *
   * @param arr - Array of numbers
   * @returns The maximum value
   * @throws Error if array is empty
   */
  max(arr: number[]): number {
    if (arr.length === 0) {
      throw new Error('Cannot find max of empty array');
    }
    return Math.max(...arr);
  }

  /**
   * Sort an array in ascending order (returns a new array)
   *
   * @param arr - Array of numbers
   * @returns New sorted array
   */
  sort(arr: number[]): number[] {
    return [...arr].sort((a, b) => a - b);
  }
}

/**
 * Singleton instance for convenience
 */
export const stats = new Statistics();
