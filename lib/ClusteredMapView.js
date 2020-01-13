import React, { memo, useState, useEffect, useMemo, createRef } from "react";
import { Dimensions, LayoutAnimation, Platform } from "react-native";
import MapView from "react-native-maps";
import SuperCluster from "supercluster";
import ClusterMarker from "./ClusteredMarker";
import {
  isMarker,
  markerToGeoJSONFeature,
  calculateBBox,
  returnMapZoom
} from "./helpers";

const ClusteredMapView = ({
  radius,
  maxZoom,
  minZoom,
  extent,
  nodeSize,
  children,
  onClusterPress,
  onRegionChangeComplete,
  preserveClusterPressBehavior,
  clusteringEnabled,
  clusterColor,
  clusterTextColor,
  layoutAnimationConf,
  animationEnabled,
  renderCluster,
  ...restProps
}) => {
  const [markers, updateMarkers] = useState([]);
  const [otherChildren, updateChildren] = useState([]);
  const [superClusterArray, setSuperClusterArray] = useState(null);
  const [currentRegion, updateRegion] = useState(
    restProps.region || restProps.initialRegion
  );
  const mapRef = createRef();
  let markerTypes = [];

  const propsChildren = useMemo(() => React.Children.toArray(children), [
    children
  ]);

  useEffect(() => {
    const otherChildren = [];
    const superClusters = [];
    const markersByType = {};

    if (!clusteringEnabled) {
      updateChildren(propsChildren);
      return;
    }

    React.Children.forEach(children, (child, i) => {
      if (isMarker(child) && child.props.type) {
        const { type } = child.props;
        if(!markersByType.hasOwnProperty(type)) {
          markersByType[type] = [];
          markerTypes.push(type);
        } 
          markersByType[type].push(markerToGeoJSONFeature(child, i))
      }  else {
        otherChildren.push(child);
      }
    });

    // Generate Supercluster for each type
    markerTypes.forEach((type, index) => {
        superClusters.push(new SuperCluster({
          radius,
          maxZoom,
          minZoom,
          extent,
          nodeSize,
          //set extra attribute superClusterId to find superCluster in onClusterPress
          superClusterId: type,
        }))
        // load corresponding markers into the supercluster
        if(markersByType[type] && superClusters[index]) {
          superClusters[index].load(markersByType[type])
        }
      })

    const bBox = calculateBBox(currentRegion);
    const zoom = returnMapZoom(currentRegion, bBox, minZoom);
    
    markerTypes.forEach( (type, index) => {
      if(markerTypes.length && superClusters[index]) {
        markersByType[type] = superClusters[index].getClusters(bBox, zoom).map(marker => ({...marker, type}));
      }
  })

    updateMarkers(Object.values(markersByType).flat());
    updateChildren(otherChildren);
    setSuperClusterArray(superClusters);
  }, [children, restProps.region, restProps.initialRegion]);

  const _onRegionChangeComplete = region => {
      if (animationEnabled && Platform.OS === "ios") {
        LayoutAnimation.configureNext(layoutAnimationConf);
      }

      onRegionChangeComplete(region, markers);
      updateRegion(region);
    
  };

  const _onClusterPress = marker => () => {
    const superCluster = superClusterArray.find(superC => superC.options.superClusterId === marker.type);
    const children = superCluster.getLeaves(marker.id);

    if (preserveClusterPressBehavior) {
      onClusterPress(marker, children);
      return;
    }

    const coordinates = children.map(({ geometry }) => ({
      latitude: geometry.coordinates[1],
      longitude: geometry.coordinates[0]
    }));

    mapRef.current.fitToCoordinates(coordinates, {
      edgePadding: restProps.edgePadding
    });

    onClusterPress(marker, children);
  };

  return (
    <MapView
      {...restProps}
      ref={map => {
        restProps.mapRef(map);
        mapRef.current = map;
      }}
      onRegionChangeComplete={_onRegionChangeComplete}
    >
      {markers.map((marker, index) =>
        marker.properties.point_count === 0 ? (
          propsChildren[marker.properties.index]
        ) : renderCluster ? (
          renderCluster({
            key: `cluster-${marker.id}-${index}`,
            onPress: _onClusterPress(marker),
            clusterColor,
            clusterTextColor,
            ...marker
          })
        ) : (
          <ClusterMarker
            key={`cluster-${marker.id}-${index}`}
            {...marker}
            onPress={_onClusterPress(marker)}
            clusterColor={clusterColor()}
            clusterTextColor={clusterTextColor}
            tracksViewChanges={tracksViewChanges}
          />
        )
      )}
      {otherChildren}
    </MapView>
  );
};

ClusteredMapView.defaultProps = {
  clusteringEnabled: true,
  animationEnabled: true,
  preserveClusterPressBehavior: false,
  layoutAnimationConf: LayoutAnimation.Presets.spring,
  tracksViewChanges: false,
  // SuperCluster parameters
  radius: Dimensions.get("window").width * 0.06,
  maxZoom: 20,
  minZoom: 1,
  extent: 512,
  nodeSize: 64,
  // Map parameters
  edgePadding: { top: 50, left: 50, right: 50, bottom: 50 },
  // Cluster styles
  clusterColor: () => "#00B386",
  clusterTextColor: () => "#FFFFFF",
  // Callbacks
  onRegionChangeComplete: () => {},
  onClusterPress: () => {},
  mapRef: () => {}
};

export default memo(ClusteredMapView);
