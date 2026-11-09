import {Image} from "react-native";
export function PlotLogo(){
  return <Image source={require("../../assets/brand/plot-logo-transparent.png")} accessibilityLabel="Plot!" accessible resizeMode="contain" style={{width:104,height:46}}/>;
}
