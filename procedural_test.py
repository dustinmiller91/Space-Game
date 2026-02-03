import numpy as np
import matplotlib.pyplot as plt

array_size = 102
seed_chance = .0005
flip_chance = .2
n_passes = 7

array = np.full((array_size, array_size), False)

# randomly assign True seeds
# i is column index, j is row index
for i in range(array_size):
    for j in range(array_size):
        if np.random.rand() < seed_chance:
            array[i, j] = True

sign=1
for n in range(n_passes):
    for i in range(1, array_size-1):
        for j in range(1, array_size-1):
            # Determine traversal order based on pass number to avoid directional bias
            if n % 2 == 0:
                row = j * sign
                col = i * sign
            else:
                row = i * sign
                col = j * sign

            # Small chance to seed a new True value each pass
            if np.random.rand() < seed_chance:
                array[row, col] = True

            # Array of all 8 neighboring cells
            neighbors = [
                (row-1, col), (row+1, col),
                (row, col-1), (row, col+1),
                (row-1, col-1), (row-1, col+1),
                (row+1, col-1), (row+1, col+1)
            ]

            for coords in neighbors:
                if array[coords] and np.random.rand() < flip_chance:
                    array[row, col] = True
                    continue
    
    # Reverse direction every 3rd and 4th pass
    # When combined by with alternating traversal order, this means we traverse from all 4 directions
    if n % 3 == 0 or n % 4 == 0:
        sign = sign * -1  # Reverse direction for next pass

plt.imshow(array, cmap='gray', vmin=0, vmax=1)
plt.axis('off')  # Remove axes if you want just the image
plt.show()