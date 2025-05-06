# Use the official sitespeed.io image as the base
FROM sitespeedio/sitespeed.io

# Set the working directory inside the container
WORKDIR /usr/src/app

# Install the InfluxDB plugin globally within the container's Node.js environment
# We use npm install -g to make it available to the sitespeed.io command
RUN npm install -g @sitespeed.io/plugin-influxdb

# The rest of the original image's configuration (entrypoint, etc.) is inherited
